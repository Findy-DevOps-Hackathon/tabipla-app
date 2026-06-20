import type { estypes } from "@elastic/elasticsearch";
import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME } from "../mappings/spot.mapping.js";
import type { SearchResult, SpotDocument } from "../types/spot.js";
import {
  buildFilters,
  DEFAULT_SEARCH_FIELDS,
  DEFAULT_SIZE,
  keywordSearch,
  toSearchResult,
} from "./keywordSearch.js";
import { DEFAULT_K, vectorSearch } from "./vectorSearch.js";

export type HybridSearchParams = {
  /** 検索キーワード。未指定（空）の場合はベクトル検索のみになる。 */
  query?: string;
  /** クエリ埋め込みベクトル。未指定の場合はキーワード検索のみになる。 */
  embedding?: number[];
  /** filter 条件（keywordSearch と同じ形式）。 */
  filters?: Record<string, unknown>;
  /** 取得件数。省略時は DEFAULT_SIZE。 */
  size?: number;
  /** kNN の近傍数 k。省略時は size。 */
  k?: number;
  /** 対象 index 名。省略時は DEFAULT_INDEX_NAME。 */
  index?: string;
  /** 検索対象フィールド（キーワード）。省略時は DEFAULT_SEARCH_FIELDS。 */
  fields?: readonly string[];
  /** ベクトルフィールド名。省略時は "embedding"。 */
  vectorField?: string;
  /**
   * kNN スコアに掛ける重み（boost）。省略時は 1。
   * キーワードスコアとベクトルスコアのバランス調整に使う。
   */
  knnBoost?: number;
};

/**
 * ハイブリッド検索（キーワード + ベクトル）を実行する。
 *
 * 挙動:
 *   - query のみ指定 → キーワード検索（keywordSearch）に委譲。
 *   - embedding のみ指定 → ベクトル検索（vectorSearch）に委譲。
 *   - 両方指定 → 1回の検索リクエストで `query`(bool) と `knn` を併用する。
 *   - どちらも未指定 → エラー。
 *
 * スコア統合方法:
 *   両方指定時は Elasticsearch の既定挙動に従い、
 *   「キーワードクエリのスコア」と「kNN のスコア(× knnBoost)」を加算した合計スコアで
 *   ランキングする。複雑な再ランキング（RRF 等）は初期実装では行わない。
 *   将来 RRF や重み学習へ差し替えられるよう、本関数をスコア統合の単一窓口とする。
 *
 * @param client Elasticsearch クライアント
 * @param params 検索パラメータ
 * @returns 検索結果配列
 */
export async function hybridSearch<T extends SpotDocument = SpotDocument>(
  client: ElasticsearchClient,
  params: HybridSearchParams,
): Promise<SearchResult<T>[]> {
  const hasQuery = Boolean(params.query?.trim());
  const hasEmbedding = Boolean(params.embedding && params.embedding.length > 0);

  if (!hasQuery && !hasEmbedding) {
    throw new Error(
      "[search-core] hybridSearch: query または embedding の少なくとも一方が必要です。",
    );
  }

  const index = params.index ?? DEFAULT_INDEX_NAME;
  const size = params.size ?? DEFAULT_SIZE;

  // キーワードのみ
  if (hasQuery && !hasEmbedding) {
    return keywordSearch<T>(client, {
      query: params.query as string,
      filters: params.filters,
      size,
      index,
      fields: params.fields,
    });
  }

  // ベクトルのみ
  if (!hasQuery && hasEmbedding) {
    return vectorSearch<T>(client, {
      embedding: params.embedding as number[],
      k: params.k ?? size,
      filters: params.filters,
      index,
      field: params.vectorField,
    });
  }

  // 両方指定: query + knn を 1 リクエストで併用しスコアを加算する。
  const fields = (params.fields ?? DEFAULT_SEARCH_FIELDS) as string[];
  const filter = buildFilters(params.filters);
  const k = params.k ?? size ?? DEFAULT_K;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      must: [{ multi_match: { query: params.query as string, fields } }],
      filter,
    },
  };

  const knn: estypes.KnnSearch = {
    field: params.vectorField ?? "embedding",
    query_vector: params.embedding as number[],
    k,
    num_candidates: k * 10,
    boost: params.knnBoost ?? 1,
    ...(filter.length > 0 ? { filter } : {}),
  };

  const response = await client.search<T>({
    index,
    size,
    query,
    knn,
  });

  return response.hits.hits.map((hit) => toSearchResult<T>(hit));
}

import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME } from "../mappings/spot.mapping.js";
import type { SearchResult, SpotDocument } from "../types/spot.js";
import { DEFAULT_SIZE, keywordSearch } from "./keywordSearch.js";
import { DEFAULT_RRF_RANK_CONSTANT, reciprocalRankFusion } from "./rrf.js";
import { vectorSearch } from "./vectorSearch.js";

/**
 * RRF 融合時に各サブ検索（キーワード / ベクトル）から取得する候補件数の下限。
 * 融合の質を保つため、最終 size より広めの window を取る。
 */
export const DEFAULT_RRF_WINDOW_SIZE = 50;

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
   * RRF の順位定数 k。省略時は DEFAULT_RRF_RANK_CONSTANT(=60)。
   * 小さいほど上位順位を強調する。
   */
  rrfRankConstant?: number;
  /**
   * RRF 融合時に各サブ検索から取得する候補件数（window）。
   * 省略時は max(size, k, DEFAULT_RRF_WINDOW_SIZE)。
   */
  rrfWindowSize?: number;
  /**
   * @deprecated 加算方式時代の kNN スコア重み。RRF（順位ベース融合）では順位のみを
   * 用いるため無視される。順位の重み調整は将来 reciprocalRankFusion 側で対応する。
   * 既存 API（backend-api）の互換のために型としては受け付ける。
   */
  knnBoost?: number;
};

/**
 * ハイブリッド検索（キーワード + ベクトル）を実行する。
 *
 * 挙動:
 *   - query のみ指定 → キーワード検索（keywordSearch）に委譲。
 *   - embedding のみ指定 → ベクトル検索（vectorSearch）に委譲。
 *   - 両方指定 → キーワード検索とベクトル検索を別々に実行し、
 *     RRF（Reciprocal Rank Fusion / 順位ベース融合）でスコアを統合する。
 *   - どちらも未指定 → エラー。
 *
 * スコア統合方法（両方指定時）:
 *   キーワードの BM25 スコアと kNN の cosine スコアはスケールが異なり、単純加算では
 *   どちらか一方に偏りやすい。そこで本実装では各サブ検索の「順位」だけを用いる
 *   RRF を採用する。各ドキュメントのスコアは
 *     score = Σ 1 / (rrfRankConstant + rank)
 *   で計算し、降順にランキングする。融合ロジックは reciprocalRankFusion に集約し、
 *   将来の重み付き RRF などへ差し替えやすくしている。
 *
 *   返り値の `score` は RRF スコアであり、元の BM25 / cosine スコアではない。
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

  // 両方指定: キーワード検索とベクトル検索を別々に実行し、RRF で順位融合する。
  const k = params.k ?? size;
  const windowSize = params.rrfWindowSize ?? Math.max(size, k, DEFAULT_RRF_WINDOW_SIZE);

  const [keywordResults, vectorResults] = await Promise.all([
    keywordSearch<T>(client, {
      query: params.query as string,
      filters: params.filters,
      size: windowSize,
      index,
      fields: params.fields,
    }),
    vectorSearch<T>(client, {
      embedding: params.embedding as number[],
      k: windowSize,
      filters: params.filters,
      index,
      field: params.vectorField,
    }),
  ]);

  return reciprocalRankFusion<T>([keywordResults, vectorResults], {
    rankConstant: params.rrfRankConstant ?? DEFAULT_RRF_RANK_CONSTANT,
    size,
  });
}

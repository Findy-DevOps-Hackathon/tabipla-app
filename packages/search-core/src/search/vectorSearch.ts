import type { estypes } from "@elastic/elasticsearch";
import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME, VECTOR_DIMS } from "../mappings/spot.mapping.js";
import type { SpotDocument, SearchResult } from "../types/spot.js";
import { buildFilters, toSearchResult } from "./keywordSearch.js";

/** kNN 検索で取得する近傍数のデフォルト値。 */
export const DEFAULT_K = 10;

export type VectorSearchParams = {
  /**
   * 検索クエリの埋め込みベクトル。
   * embedding 生成は search-core の責務外であり、呼び出し元が事前に生成して渡す。
   */
  embedding: number[];
  /** 取得する近傍数 k。省略時は DEFAULT_K。 */
  k?: number;
  /**
   * kNN 候補数（num_candidates）。省略時は k * 10（ES の一般的な目安）。
   * 大きいほど精度は上がるがコストも増える。
   */
  numCandidates?: number;
  /** filter 条件（keywordSearch と同じ形式）。 */
  filters?: Record<string, unknown>;
  /** 対象 index 名。省略時は DEFAULT_INDEX_NAME。 */
  index?: string;
  /** ベクトルフィールド名。省略時は "embedding"。 */
  field?: string;
};

/**
 * 入力ベクトルの妥当性を検証する。
 * 不正な場合は呼び出し元が原因を把握できるエラーを送出する。
 */
function assertValidEmbedding(embedding: number[], field: string): void {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      `[search-core] vectorSearch: embedding は空でない数値配列である必要があります（field=${field}）。`,
    );
  }
  if (embedding.length !== VECTOR_DIMS) {
    throw new Error(
      `[search-core] vectorSearch: embedding の次元数が一致しません。期待=${VECTOR_DIMS}, 実際=${embedding.length}。` +
        " 環境変数 ES_VECTOR_DIMS と利用する埋め込みモデルを確認してください。",
    );
  }
  if (embedding.some((v) => typeof v !== "number" || Number.isNaN(v))) {
    throw new Error(
      "[search-core] vectorSearch: embedding に数値以外または NaN が含まれています。",
    );
  }
}

/**
 * ベクトル検索（kNN）を実行する。
 *
 * - embedding が未提供・次元不一致・NaN を含む場合はエラーを送出する。
 * - filter は kNN の pre-filter として適用する。
 *
 * @param client Elasticsearch クライアント
 * @param params 検索パラメータ
 * @returns 検索結果配列
 */
export async function vectorSearch<T extends SpotDocument = SpotDocument>(
  client: ElasticsearchClient,
  params: VectorSearchParams,
): Promise<SearchResult<T>[]> {
  const field = params.field ?? "embedding";
  assertValidEmbedding(params.embedding, field);

  const index = params.index ?? DEFAULT_INDEX_NAME;
  const k = params.k ?? DEFAULT_K;
  const numCandidates = params.numCandidates ?? k * 10;
  const filter: estypes.QueryDslQueryContainer[] = buildFilters(params.filters);

  const response = await client.search<T>({
    index,
    knn: {
      field,
      query_vector: params.embedding,
      k,
      num_candidates: numCandidates,
      ...(filter.length > 0 ? { filter } : {}),
    },
    size: k,
  });

  return response.hits.hits.map((hit) => toSearchResult<T>(hit));
}

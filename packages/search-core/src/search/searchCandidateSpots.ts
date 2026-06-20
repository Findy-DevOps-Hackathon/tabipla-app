import type { estypes } from "@elastic/elasticsearch";
import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME, VECTOR_DIMS } from "../mappings/spot.mapping.js";
import type { SearchResult, SpotDocument } from "../types/spot.js";
import { buildCandidateSpotFilters, type CandidateSpotFilterParams } from "./buildSpotFilters.js";
import { DEFAULT_SEARCH_FIELDS, DEFAULT_SIZE, toSearchResult } from "./keywordSearch.js";

export type SearchCandidateSpotsParams = CandidateSpotFilterParams & {
  /** 検索キーワード。 */
  query?: string;
  /** クエリ埋め込みベクトル（kNN）。 */
  embedding?: number[];
  /** 取得件数。省略時は DEFAULT_SIZE。 */
  size?: number;
  /** kNN の近傍数 k。省略時は size。 */
  k?: number;
  /** 対象 index 名。省略時は DEFAULT_INDEX_NAME。 */
  index?: string;
  /** kNN スコアに掛ける重み。省略時は 1。 */
  knnBoost?: number;
};

function hasStructuredFilters(params: CandidateSpotFilterParams): boolean {
  return (
    params.category !== undefined ||
    params.priceMin !== undefined ||
    params.priceMax !== undefined ||
    params.near !== undefined
  );
}

function assertValidEmbedding(embedding: number[]): void {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      "[search-core] searchCandidateSpots: embedding は空でない数値配列である必要があります。",
    );
  }
  if (embedding.length !== VECTOR_DIMS) {
    throw new Error(
      `[search-core] searchCandidateSpots: embedding の次元数が一致しません。期待=${VECTOR_DIMS}, 実際=${embedding.length}。`,
    );
  }
}

/**
 * 候補スポット検索（A3 契約 I/F）。
 *
 * kNN × geo_distance × price/category を 1 関数に統合する。
 *
 * 挙動:
 *   - query のみ → キーワード + フィルタ
 *   - embedding のみ → kNN + フィルタ
 *   - 両方 → ハイブリッド（キーワード + kNN スコア加算）+ フィルタ
 *   - どちらも未指定 → フィルタのみ（match_all + filter）
 */
export async function searchCandidateSpots<T extends SpotDocument = SpotDocument>(
  client: ElasticsearchClient,
  params: SearchCandidateSpotsParams,
): Promise<SearchResult<T>[]> {
  const hasQuery = Boolean(params.query?.trim());
  const hasEmbedding = Boolean(params.embedding && params.embedding.length > 0);

  if (!hasQuery && !hasEmbedding && !hasStructuredFilters(params)) {
    throw new Error(
      "[search-core] searchCandidateSpots: query、embedding、フィルタの少なくとも一方が必要です。",
    );
  }

  const index = params.index ?? DEFAULT_INDEX_NAME;
  const size = params.size ?? DEFAULT_SIZE;
  const filter = buildCandidateSpotFilters(params);

  if (hasQuery && !hasEmbedding) {
    const trimmed = params.query?.trim();
    const mustQuery: estypes.QueryDslQueryContainer = trimmed
      ? {
          multi_match: {
            query: trimmed,
            fields: [...DEFAULT_SEARCH_FIELDS],
          },
        }
      : { match_all: {} };

    const response = await client.search<T>({
      index,
      size,
      query: { bool: { must: [mustQuery], filter } },
    });
    return response.hits.hits.map((hit) => toSearchResult<T>(hit));
  }

  if (!hasQuery && hasEmbedding) {
    assertValidEmbedding(params.embedding as number[]);
    const k = params.k ?? size;

    const response = await client.search<T>({
      index,
      knn: {
        field: "embedding",
        query_vector: params.embedding as number[],
        k,
        num_candidates: k * 10,
        ...(filter.length > 0 ? { filter } : {}),
      },
      size: k,
    });
    return response.hits.hits.map((hit) => toSearchResult<T>(hit));
  }

  if (!hasQuery && !hasEmbedding) {
    const response = await client.search<T>({
      index,
      size,
      query: { bool: { must: [{ match_all: {} }], filter } },
    });
    return response.hits.hits.map((hit) => toSearchResult<T>(hit));
  }

  assertValidEmbedding(params.embedding as number[]);
  const k = params.k ?? size;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      must: [
        {
          multi_match: {
            query: params.query as string,
            fields: [...DEFAULT_SEARCH_FIELDS],
          },
        },
      ],
      filter,
    },
  };

  const knn: estypes.KnnSearch = {
    field: "embedding",
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

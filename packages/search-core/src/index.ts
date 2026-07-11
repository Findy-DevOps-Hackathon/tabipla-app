/**
 * @tabipla/search-core 公開API
 *
 * 外部（backend-api / agent-api 等）から利用する関数・型のみを export する。
 * 内部実装の詳細を無制限に公開しない（指示書 10.）。
 */

export type {
  CreateClientOptions,
  ElasticsearchClient,
} from "./client/elasticsearch.client.js";

// クライアント
export {
  createElasticsearchClient,
  getDefaultClient,
  pingElasticsearch,
} from "./client/elasticsearch.client.js";
export { deleteDocument } from "./indexing/deleteDocument.js";
export type { IndexingOptions } from "./indexing/indexDocument.js";

// Indexing
export {
  bulkIndexDocuments,
  indexDocument,
} from "./indexing/indexDocument.js";
export { deleteSpot, indexSpot } from "./indexing/spotIndexing.js";
export { updateDocument } from "./indexing/updateDocument.js";
// Mapping / Index
export {
  DEFAULT_INDEX_NAME,
  ensureIndex,
  spotMapping,
  VECTOR_DIMS,
} from "./mappings/spot.mapping.js";
export {
  buildCandidateSpotFilters,
  type CandidateSpotFilterParams,
} from "./search/buildSpotFilters.js";
export type { HybridSearchParams } from "./search/hybridSearch.js";
export { hybridSearch } from "./search/hybridSearch.js";
export type { KeywordSearchParams } from "./search/keywordSearch.js";
// Search
export { keywordSearch } from "./search/keywordSearch.js";
export type { RrfOptions } from "./search/rrf.js";
export { DEFAULT_RRF_RANK_CONSTANT, reciprocalRankFusion } from "./search/rrf.js";
export type { SearchCandidateSpotsParams } from "./search/searchCandidateSpots.js";
export { searchCandidateSpots } from "./search/searchCandidateSpots.js";
export type { VectorSearchParams } from "./search/vectorSearch.js";
export { vectorSearch } from "./search/vectorSearch.js";
// 型
export type { SearchResult, SpotDocument } from "./types/spot.js";

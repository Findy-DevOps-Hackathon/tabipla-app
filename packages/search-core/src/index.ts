/**
 * @tabipla/search-core 公開API
 *
 * 外部（backend-api / agent-api 等）から利用する関数・型のみを export する。
 * 内部実装の詳細を無制限に公開しない（指示書 10.）。
 */

// 型
export type { SpotDocument, GeoPoint, SearchResult } from "./types/spot.js";

// クライアント
export {
  createElasticsearchClient,
  getDefaultClient,
  pingElasticsearch,
} from "./client/elasticsearch.client.js";
export type {
  ElasticsearchClient,
  CreateClientOptions,
} from "./client/elasticsearch.client.js";

// Mapping / Index
export {
  DEFAULT_INDEX_NAME,
  VECTOR_DIMS,
  spotMapping,
  ensureIndex,
} from "./mappings/spot.mapping.js";

// Indexing
export {
  indexDocument,
  bulkIndexDocuments,
} from "./indexing/indexDocument.js";
export type { IndexingOptions } from "./indexing/indexDocument.js";
export { updateDocument } from "./indexing/updateDocument.js";
export { deleteDocument } from "./indexing/deleteDocument.js";

// Search
export { keywordSearch } from "./search/keywordSearch.js";
export type { KeywordSearchParams } from "./search/keywordSearch.js";
export { vectorSearch } from "./search/vectorSearch.js";
export type { VectorSearchParams } from "./search/vectorSearch.js";
export { hybridSearch } from "./search/hybridSearch.js";
export type { HybridSearchParams } from "./search/hybridSearch.js";

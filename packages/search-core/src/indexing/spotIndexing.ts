import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import type { SpotDocument } from "../types/spot.js";
import {
  bulkIndexDocuments,
  indexDocument,
  type IndexingOptions,
} from "./indexDocument.js";
import { deleteDocument } from "./deleteDocument.js";

/**
 * スポットを Elasticsearch に索引する（A3 契約 I/F）。
 * B4 取り込みパイプラインから呼び出す想定。
 */
export async function indexSpot(
  client: ElasticsearchClient,
  document: SpotDocument,
  options: IndexingOptions = {},
): Promise<{ index: string; id: string }> {
  return indexDocument(client, document, options);
}

/** 複数スポットを一括索引する。 */
export { bulkIndexDocuments };

/**
 * スポットを Elasticsearch から削除する（A3 契約 I/F）。
 */
export async function deleteSpot(
  client: ElasticsearchClient,
  id: string,
  options: IndexingOptions = {},
): Promise<{ index: string; id: string; deleted: boolean }> {
  return deleteDocument(client, id, options);
}

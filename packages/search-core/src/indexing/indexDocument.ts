import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME } from "../mappings/spot.mapping.js";
import type { SpotDocument } from "../types/spot.js";

/**
 * Indexing 系操作の共通オプション。
 */
export type IndexingOptions = {
  /** 対象 index 名（省略時は DEFAULT_INDEX_NAME）。 */
  index?: string;
  /** 即時に検索可能にするか（true で refresh）。開発・テスト用途を想定。 */
  refresh?: boolean;
};

/**
 * ドキュメントを登録（新規作成 or 上書き）する。
 *
 * - `id` を Elasticsearch の _id として明示的に扱う。
 * - 同一 id が存在する場合は上書きされる（index API のセマンティクス）。
 * - 失敗時は Elasticsearch のエラーをそのまま送出し、握りつぶさない。
 *
 * @param client Elasticsearch クライアント
 * @param document 登録するドキュメント（id 必須）
 * @param options index 名・refresh の指定
 * @returns 登録した index 名と id
 */
export async function indexDocument(
  client: ElasticsearchClient,
  document: SpotDocument,
  options: IndexingOptions = {},
): Promise<{ index: string; id: string }> {
  if (!document.id) {
    throw new Error("[search-core] indexDocument: document.id は必須です。");
  }

  const index = options.index ?? DEFAULT_INDEX_NAME;

  await client.index({
    index,
    id: document.id,
    document,
    ...(options.refresh ? { refresh: true } : {}),
  });

  return { index, id: document.id };
}

/**
 * 複数ドキュメントを bulk API で一括登録する。
 *
 * @param client Elasticsearch クライアント
 * @param documents 登録するドキュメント配列（各 id 必須）
 * @param options index 名・refresh の指定
 * @returns 登録件数とエラーの有無
 */
export async function bulkIndexDocuments(
  client: ElasticsearchClient,
  documents: SpotDocument[],
  options: IndexingOptions = {},
): Promise<{ index: string; count: number; errors: boolean }> {
  const index = options.index ?? DEFAULT_INDEX_NAME;

  if (documents.length === 0) {
    return { index, count: 0, errors: false };
  }

  const missingId = documents.find((doc) => !doc.id);
  if (missingId) {
    throw new Error("[search-core] bulkIndexDocuments: すべてのドキュメントに id が必要です。");
  }

  const operations = documents.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]);

  const response = await client.bulk({
    operations,
    ...(options.refresh ? { refresh: true } : {}),
  });

  return { index, count: documents.length, errors: response.errors };
}

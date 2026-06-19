import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME } from "../mappings/spot.mapping.js";
import type { SpotDocument } from "../types/spot.js";
import type { IndexingOptions } from "./indexDocument.js";

/**
 * 既存ドキュメントを部分更新する。
 *
 * - `id` 以外のフィールドを部分的に更新する（partial document update）。
 * - 対象ドキュメントが存在しない場合、Elasticsearch は 404 エラーを送出する。
 *   呼び出し元が原因を判断できるよう、エラーは握りつぶさない。
 *
 * @param client Elasticsearch クライアント
 * @param id 更新対象のドキュメントID
 * @param partial 更新する部分フィールド（id は変更不可）
 * @param options index 名・refresh の指定
 * @returns 更新した index 名と id
 */
export async function updateDocument(
  client: ElasticsearchClient,
  id: string,
  partial: Partial<Omit<SpotDocument, "id">>,
  options: IndexingOptions = {},
): Promise<{ index: string; id: string }> {
  if (!id) {
    throw new Error("[search-core] updateDocument: id は必須です。");
  }

  const index = options.index ?? DEFAULT_INDEX_NAME;

  await client.update({
    index,
    id,
    doc: partial,
    ...(options.refresh ? { refresh: true } : {}),
  });

  return { index, id };
}

import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME } from "../mappings/spot.mapping.js";
import type { IndexingOptions } from "./indexDocument.js";

/**
 * ドキュメントを削除する。
 *
 * - 対象が存在しない場合（404）はエラーにせず `{ deleted: false }` を返す（冪等）。
 * - それ以外の障害（接続失敗等）は握りつぶさず送出する。
 *
 * @param client Elasticsearch クライアント
 * @param id 削除対象のドキュメントID
 * @param options index 名・refresh の指定
 * @returns 削除されたかどうか
 */
export async function deleteDocument(
  client: ElasticsearchClient,
  id: string,
  options: IndexingOptions = {},
): Promise<{ index: string; id: string; deleted: boolean }> {
  if (!id) {
    throw new Error("[search-core] deleteDocument: id は必須です。");
  }

  const index = options.index ?? DEFAULT_INDEX_NAME;

  try {
    const response = await client.delete({
      index,
      id,
      ...(options.refresh ? { refresh: true } : {}),
    });
    return { index, id, deleted: response.result === "deleted" };
  } catch (error) {
    // 存在しないドキュメントの削除は冪等に扱う（404 のみ許容）。
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      (error as { statusCode?: number }).statusCode === 404
    ) {
      return { index, id, deleted: false };
    }
    throw error;
  }
}

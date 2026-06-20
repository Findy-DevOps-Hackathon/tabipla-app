import {
  DEFAULT_INDEX_NAME,
  type ElasticsearchClient,
  type IndexingOptions,
  indexSpot,
  type SpotDocument,
  updateDocument,
} from "@tabipla/search-core";

type SyncOptions = IndexingOptions;

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode: number }).statusCode === 404
  );
}

/**
 * ES へスポットを upsert する。既存ドキュメントに embedding があれば保持する。
 */
export async function upsertSpotInElasticsearch(
  client: ElasticsearchClient,
  document: SpotDocument,
  options: SyncOptions = {},
): Promise<{ index: string; id: string }> {
  const index = options.index ?? DEFAULT_INDEX_NAME;

  try {
    const existing = await client.get({ index, id: document.id });
    const src = existing._source as SpotDocument | undefined;
    if (src?.embedding?.length) {
      return indexSpot(client, { ...document, embedding: src.embedding }, options);
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  return indexSpot(client, document, options);
}

/**
 * ES 上の既存フィールドを部分更新する（embedding は触らない）。
 */
export async function patchSpotInElasticsearch(
  client: ElasticsearchClient,
  id: string,
  partial: Partial<Omit<SpotDocument, "id">>,
  options: SyncOptions = {},
): Promise<{ index: string; id: string }> {
  return updateDocument(client, id, partial, options);
}

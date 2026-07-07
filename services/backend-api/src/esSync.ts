import {
  type ElasticsearchClient,
  type IndexingOptions,
  indexSpot,
  type SpotDocument,
  updateDocument,
  VECTOR_DIMS,
} from "@tabipla/search-core";

type SyncOptions = IndexingOptions;

function assertValidSpotEmbedding(embedding: number[] | undefined, spotId: string): number[] {
  if (!Array.isArray(embedding) || embedding.length !== VECTOR_DIMS) {
    throw new Error(
      `[esSync] スポット ${spotId} の embedding が必須です（${VECTOR_DIMS} 次元）。登録前に生成してください。`,
    );
  }
  if (embedding.some((value) => typeof value !== "number" || Number.isNaN(value))) {
    throw new Error(`[esSync] スポット ${spotId} の embedding に不正な値が含まれています。`);
  }
  return embedding;
}

/**
 * ES へスポットを upsert する。embedding 必須。
 */
export async function upsertSpotInElasticsearch(
  client: ElasticsearchClient,
  document: SpotDocument,
  options: SyncOptions = {},
): Promise<{ index: string; id: string }> {
  const embedding = assertValidSpotEmbedding(document.embedding, document.id);
  return indexSpot(client, { ...document, embedding }, options);
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

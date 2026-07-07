import type { Client, estypes } from "@elastic/elasticsearch";

/**
 * デフォルトの index 名。環境変数 ES_INDEX で上書き可能。
 */
export const DEFAULT_INDEX_NAME = process.env.ES_INDEX ?? "spots";

/**
 * ベクトル(dense_vector)の次元数。
 * Embedding 生成は search-core の責務外だが、mapping を確定するために次元数だけは
 * 定数として管理する。利用する埋め込みモデルに合わせて環境変数 ES_VECTOR_DIMS で上書きする。
 *
 * 既定値 1536 は Gemini Embeddings（outputDimensionality）と揃えた値。
 * 変更する場合は ES_VECTOR_DIMS で上書きし、index を再作成すること。
 */
export const VECTOR_DIMS: number = (() => {
  const raw = process.env.ES_VECTOR_DIMS;
  if (!raw) return 1536;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`ES_VECTOR_DIMS には正の整数を指定してください。受け取った値: "${raw}"`);
  }
  return parsed;
})();

/**
 * SpotDocument（観光スポット）用の Elasticsearch mapping 定義。
 *
 * - name / description: 全文検索用の text（name は keyword サブフィールドも保持）。
 * - category / prefecture: 完全一致・集計向けの keyword。
 * - area: text + keyword（部分一致と完全一致の両対応）。
 * - location: geo_point（距離検索・地図表示）。
 * - embedding: dense_vector（ベクトル検索）。
 * - createdAt / updatedAt: date。
 */
export const spotMapping: estypes.MappingTypeMapping = {
  properties: {
    id: { type: "keyword" },
    name: {
      type: "text",
      fields: {
        keyword: { type: "keyword", ignore_above: 256 },
      },
    },
    description: { type: "text" },
    category: { type: "keyword" },
    area: {
      type: "text",
      fields: {
        keyword: { type: "keyword", ignore_above: 256 },
      },
    },
    prefecture: { type: "keyword" },
    address: { type: "text" },
    highlights: { type: "text" },
    imageUrl: { type: "keyword", index: false },
    location: { type: "geo_point" },
    embedding: {
      type: "dense_vector",
      dims: VECTOR_DIMS,
      index: true,
      similarity: "cosine",
    },
    createdAt: { type: "date" },
    updatedAt: { type: "date" },
    clusterId: { type: "integer" },
    sensoryScores: {
      properties: {
        nature: { type: "half_float" },
        history: { type: "half_float" },
        art: { type: "half_float" },
        entertainment: { type: "half_float" },
        gourmet: { type: "half_float" },
        activity: { type: "half_float" },
        quietness: { type: "half_float" },
        indoor: { type: "half_float" },
        popularity: { type: "half_float" },
      },
    },
  },
};

/**
 * index を作成する。
 *
 * すでに存在する場合の挙動:
 *   - 既定では何もせず、`{ created: false }` を返す（冪等）。
 *   - mapping の差分適用や再作成はこの関数では行わない（破壊的変更を避けるため）。
 *
 * @param client Elasticsearch クライアント
 * @param indexName 作成する index 名（省略時は DEFAULT_INDEX_NAME）
 * @returns 作成したかどうか
 */
export async function ensureIndex(
  client: Client,
  indexName: string = DEFAULT_INDEX_NAME,
): Promise<{ index: string; created: boolean }> {
  const exists = await client.indices.exists({ index: indexName });
  if (exists) {
    return { index: indexName, created: false };
  }

  await client.indices.create({
    index: indexName,
    mappings: spotMapping,
  });

  return { index: indexName, created: true };
}

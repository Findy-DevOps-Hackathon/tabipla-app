import { createHash } from "node:crypto";
import {
  createVertexGenAI,
  resolveGeminiEmbeddingModel,
  usesVertexGemini,
} from "../vertexConfig.js";

export type EmbeddingProvider = "gemini" | "hash";

export function resolveEmbeddingProvider(): EmbeddingProvider {
  const explicit = process.env.EMBEDDING_PROVIDER;
  if (explicit === "gemini" || explicit === "hash") {
    return explicit;
  }
  if (usesVertexGemini()) {
    return "gemini";
  }
  return "hash";
}

/**
 * テキストをベクトル化する (Vertex Embeddings または決定ハッシュ)
 */
export async function embedText(
  text: string,
  options: { taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" } = {},
): Promise<number[]> {
  const provider = resolveEmbeddingProvider();
  if (provider === "gemini") {
    return embedTextGemini(text, options.taskType ?? "RETRIEVAL_DOCUMENT");
  }
  return embedTextHash(text);
}

/** Vertex AI 経由での埋め込み生成。 */
async function embedTextGemini(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const model = resolveGeminiEmbeddingModel();
  const client = createVertexGenAI();
  const response = await client.models.embedContent({
    model,
    contents: text,
    config: {
      taskType,
      outputDimensionality: 1536,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== 1536) {
    throw new Error(
      `[agent/embedding] 無効なベクトルデータを受信しました (長さ: ${values?.length ?? 0})`,
    );
  }

  return values;
}

/** 決定的な擬似ハッシュベクトル生成 (再現テスト用)。 */
function embedTextHash(text: string): number[] {
  const hash = createHash("sha256").update(text).digest();
  const vector = new Array(1536).fill(0);

  for (let i = 0; i < 1536; i++) {
    const byteOffset = (i * 2) % 32;
    const isNegative = (hash[(byteOffset + 1) % 32] ?? 0) % 2 === 0;
    const value = (hash[byteOffset] ?? 0) / 255;
    vector[i] = isNegative ? -value : value;
  }

  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < 1536; i++) vector[i] /= norm;
  }

  return vector;
}

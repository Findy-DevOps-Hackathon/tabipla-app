import { createHash } from "node:crypto";

export type EmbeddingProvider = "gemini" | "hash";

export function resolveEmbeddingProvider(): EmbeddingProvider {
  const explicit = process.env.EMBEDDING_PROVIDER;
  if (explicit === "gemini" || explicit === "hash") {
    return explicit;
  }
  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  return "hash";
}

/**
 * テキストをベクトル化する (Gemini API の直接フェッチまたは決定ハッシュ)
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

/** Gemini API 経由での埋め込み生成。 */
async function embedTextGemini(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[agent/embedding] GEMINI_API_KEY が設定されていません。");
  }

  const model = "gemini-embedding-001";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
      // 1536次元に固定
      outputDimensionality: 1536,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[agent/embedding] Gemini API エラー (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values || values.length !== 1536) {
    throw new Error(`[agent/embedding] 無効なベクトルデータを受信しました (長さ: ${values?.length})`);
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

  // L2 正規化 (コサイン類似度が内積と等しくなるようにする)
  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < 1536; i++) vector[i] /= norm;
  }

  return vector;
}

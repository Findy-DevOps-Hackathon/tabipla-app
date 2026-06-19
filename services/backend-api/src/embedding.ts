import { createHash } from "node:crypto";
import { VECTOR_DIMS, type SpotDocument } from "@tabipla/search-core";

export type EmbeddingProvider = "openai" | "hash";

/**
 * 埋め込み生成のプロバイダを解決する。
 *
 * 既定は hash（API キー不要）。OpenAI を使う場合のみ
 * `EMBEDDING_PROVIDER=openai` と `OPENAI_API_KEY` を明示設定する。
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  if (process.env.EMBEDDING_PROVIDER === "openai") {
    return "openai";
  }
  return "hash";
}

/** スポットドキュメントから埋め込み用テキストを組み立てる。 */
export function buildSpotEmbedText(doc: Pick<
  SpotDocument,
  "name" | "description" | "category" | "area" | "prefecture" | "tags"
>): string {
  const parts = [
    doc.name,
    doc.description,
    doc.category,
    doc.area,
    doc.prefecture,
    doc.tags?.join(" "),
  ].filter(Boolean);
  return parts.join("\n");
}

/** テキストから埋め込みベクトルを生成する（次元数は VECTOR_DIMS と一致）。 */
export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("[backend-api] embedText: 空文字列は埋め込みできません。");
  }

  const provider = resolveEmbeddingProvider();
  if (provider === "openai") {
    return openaiEmbed(trimmed);
  }
  return hashEmbed(trimmed);
}

/**
 * OpenAI Embeddings API でベクトルを生成する。
 * OPENAI_EMBEDDING_MODEL 未設定時は text-embedding-3-small（1536 次元）を使用。
 */
async function openaiEmbed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[backend-api] OPENAI_API_KEY が設定されていません。",
    );
  }

  const model =
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[backend-api] OpenAI Embeddings API エラー (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== VECTOR_DIMS) {
    throw new Error(
      `[backend-api] OpenAI の embedding 次元数が一致しません。期待=${VECTOR_DIMS}, 実際=${embedding?.length ?? 0}。` +
        " OPENAI_EMBEDDING_MODEL または ES_VECTOR_DIMS を確認してください。",
    );
  }
  return embedding;
}

/**
 * 決定的ハッシュベースの疑似 embedding（API キー不要）。
 * 同じテキスト → 同じベクトル。意味的類似度は OpenAI ほど高くないが、
 * ローカル開発でベクトル/ハイブリッド検索の動作確認に使える。
 */
function hashEmbed(text: string): number[] {
  const vec = new Float64Array(VECTOR_DIMS);

  for (let seed = 0; seed < 12; seed++) {
    const digest = createHash("sha256")
      .update(`${seed}:${text}`)
      .digest();
    for (let j = 0; j < 4; j++) {
      const dim = digest.readUInt32BE(j * 4) % VECTOR_DIMS;
      const byte = digest[j] ?? 0;
      const tailByte = digest[31 - j] ?? 0;
      const sign = byte % 2 === 0 ? 1 : -1;
      vec[dim] = (vec[dim] ?? 0) + sign * (0.05 + tailByte / 512);
    }
  }

  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    const value = vec[i] ?? 0;
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    vec[0] = 1;
    norm = 1;
  }

  return Array.from(vec, (v) => (v ?? 0) / norm);
}

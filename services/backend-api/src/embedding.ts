import { createHash } from "node:crypto";
import { VECTOR_DIMS, type SpotDocument } from "@tabipla/search-core";

/** 現時点では hash のみ。将来 Gemini プロバイダを追加する。 */
export type EmbeddingProvider = "hash";

/** 埋め込み生成のプロバイダを解決する（現状は常に hash）。 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
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
  return hashEmbed(trimmed);
}

/**
 * 決定的ハッシュベースの疑似 embedding（API キー不要）。
 * 同じテキスト → 同じベクトル。意味的類似度は本番 embedding ほど高くないが、
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

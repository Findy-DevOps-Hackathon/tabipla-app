import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { type SpotDocument, VECTOR_DIMS } from "@tabipla/search-core";
import { fetchWithTimeout } from "./fetchWithTimeout.js";

export type EmbeddingProvider = "vertex" | "gemini" | "hash";

/** Gemini embedContent の taskType（検索用途向け）。 */
export type EmbedTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

const DEFAULT_GEMINI_MODEL = "gemini-embedding-2";
const DEFAULT_VERTEX_MODEL = "gemini-embedding-001";
const DEFAULT_VERTEX_LOCATION = "us-central1";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_TIMEOUT_MS = 30_000;

/**
 * 埋め込み生成のプロバイダを解決する。
 *
 * - EMBEDDING_PROVIDER=vertex|gemini|hash で明示指定可能。
 * - Cloud Run（GOOGLE_CLOUD_PROJECT あり）では Vertex AI を既定にする。
 * - ローカルでは GEMINI_API_KEY があれば Gemini API、なければ hash を使う。
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  const explicit = process.env.EMBEDDING_PROVIDER;
  if (explicit === "vertex" || explicit === "gemini" || explicit === "hash") {
    return explicit;
  }
  if (process.env.GOOGLE_CLOUD_PROJECT?.trim()) {
    return "vertex";
  }
  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  return "hash";
}

/** スポットドキュメントから埋め込み用テキストを組み立てる（地理情報はハードフィルタで扱うため除外）。 */
export function buildSpotEmbedText(
  doc: Pick<SpotDocument, "name" | "description" | "category" | "highlights">,
): string {
  const parts = [
    doc.name,
    doc.description,
    ...(doc.category ? (Array.isArray(doc.category) ? doc.category : [doc.category]) : []),
    ...(doc.highlights ?? []),
  ].filter(Boolean);
  return parts.join("\n");
}

export type EmbedTextOptions = {
  /** 検索クエリ用 / コーパス（スポット）用。Gemini 利用時に指定推奨。 */
  taskType?: EmbedTaskType;
};

/** テキストから埋め込みベクトルを生成する（次元数は VECTOR_DIMS と一致）。 */
export async function embedText(text: string, options: EmbedTextOptions = {}): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("[backend-api] embedText: 空文字列は埋め込みできません。");
  }

  const provider = resolveEmbeddingProvider();
  if (provider === "vertex") {
    return vertexEmbed(trimmed, options.taskType ?? "RETRIEVAL_QUERY");
  }
  if (provider === "gemini") {
    return geminiEmbed(trimmed, options.taskType ?? "RETRIEVAL_QUERY");
  }
  return hashEmbed(trimmed);
}

/** スポット登録用: embedding 生成に失敗したら例外を投げる（必須）。 */
export async function requireSpotEmbedding(
  doc: Pick<SpotDocument, "name" | "description" | "category" | "highlights">,
): Promise<number[]> {
  const text = buildSpotEmbedText(doc);
  if (!text.trim()) {
    throw new Error(
      "[backend-api] embedding 用テキストが空です。name と description を入力してください。",
    );
  }
  return embedText(text, { taskType: "RETRIEVAL_DOCUMENT" });
}

export function formatEmbeddingError(error: unknown, spotId?: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  const prefix = spotId ? `スポット ${spotId}: ` : "";
  return `${prefix}embedding の生成に失敗しました。${detail}`;
}

function resolveGeminiModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_GEMINI_MODEL;
}

function resolveVertexModel(): string {
  return process.env.VERTEX_EMBEDDING_MODEL?.trim() || DEFAULT_VERTEX_MODEL;
}

function resolveVertexLocation(): string {
  return process.env.VERTEX_EMBEDDING_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
}

function getVertexClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("[backend-api] GOOGLE_CLOUD_PROJECT が未設定です。");
  }
  return new GoogleGenAI({
    vertexai: true,
    project,
    location: resolveVertexLocation(),
  });
}

type GeminiEmbedResponse = {
  embedding?: { values?: number[] };
  error?: { message?: string };
};

/**
 * Vertex AI の Gemini Embeddings を Application Default Credentials で呼び出す。
 * Cloud Run ではサービスアカウントの roles/aiplatform.user を使うため、API キーは不要。
 */
async function vertexEmbed(text: string, taskType: EmbedTaskType): Promise<number[]> {
  const model = resolveVertexModel();
  const response = await getVertexClient().models.embedContent({
    model,
    contents: text,
    config: {
      taskType,
      outputDimensionality: VECTOR_DIMS,
      autoTruncate: false,
      abortSignal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== VECTOR_DIMS) {
    throw new Error(
      `[backend-api] Vertex AI の embedding 次元数が一致しません。期待=${VECTOR_DIMS}, 実際=${values?.length ?? 0}。` +
        " ES_VECTOR_DIMS と VERTEX_EMBEDDING_MODEL の outputDimensionality を確認してください。",
    );
  }

  return l2Normalize(values);
}

/**
 * Gemini Embeddings API（Google AI Studio）でベクトルを生成する。
 * ローカル開発・移行検証用の互換プロバイダとして残す。
 *
 * - モデル既定: gemini-embedding-2
 * - outputDimensionality: VECTOR_DIMS（ES mapping と一致させる）
 * - 3072 未満の次元では L2 正規化を行う
 */
async function geminiEmbed(text: string, taskType: EmbedTaskType): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[backend-api] GEMINI_API_KEY が設定されていません。");
  }

  const model = resolveGeminiModel();
  const url = `${GEMINI_API_BASE}/${model}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: VECTOR_DIMS,
      }),
    },
    EMBEDDING_TIMEOUT_MS,
  );

  const json = (await res.json()) as GeminiEmbedResponse;

  if (!res.ok) {
    const message = json.error?.message ?? res.statusText;
    throw new Error(`[backend-api] Gemini Embeddings API エラー (${res.status}): ${message}`);
  }

  const values = json.embedding?.values;
  if (!values || values.length !== VECTOR_DIMS) {
    throw new Error(
      `[backend-api] Gemini の embedding 次元数が一致しません。期待=${VECTOR_DIMS}, 実際=${values?.length ?? 0}。` +
        " ES_VECTOR_DIMS と GEMINI_EMBEDDING_MODEL の outputDimensionality を確認してください。",
    );
  }

  return l2Normalize(values);
}

/** L2 正規化（outputDimensionality < 3072 のときのスコア安定化）。 */
function l2Normalize(values: number[]): number[] {
  let norm = 0;
  for (const v of values) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    return values.length > 0 ? [1, ...values.slice(1)] : values;
  }
  return values.map((v) => v / norm);
}

/**
 * 決定的ハッシュベースの疑似 embedding（API キー不要）。
 * 同じテキスト → 同じベクトル。意味的類似度は Gemini ほど高くないが、
 * API キーなしでベクトル/ハイブリッド検索の配線確認に使える。
 */
function hashEmbed(text: string): number[] {
  const vec = new Float64Array(VECTOR_DIMS);

  for (let seed = 0; seed < 12; seed++) {
    const digest = createHash("sha256").update(`${seed}:${text}`).digest();
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

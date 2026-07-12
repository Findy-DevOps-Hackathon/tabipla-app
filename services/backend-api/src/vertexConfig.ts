import { GoogleGenAI } from "@google/genai";

/** Vertex AI / ADC 経由で Gemini を使うか。 */
export function usesVertexGemini(): boolean {
  const flag = process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());
}

export function getGoogleCloudProject(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "[backend-api] GOOGLE_CLOUD_PROJECT が未設定です。Vertex/ADC 利用時は .env または Cloud Run の環境変数を設定してください。",
    );
  }
  return project;
}

export function getGoogleCloudLocation(): string {
  return process.env.GOOGLE_CLOUD_LOCATION?.trim() || "asia-northeast1";
}

/** Vertex Embeddings モデル名。リージョン未指定時は location に応じて既定を選ぶ。 */
export function resolveGeminiEmbeddingModel(): string {
  const explicit = process.env.GEMINI_EMBEDDING_MODEL?.trim();
  if (explicit) {
    return explicit;
  }
  const location = getGoogleCloudLocation().toLowerCase();
  // gemini-embedding-2 は global 専用。リージョン指定時は 001 を使う。
  return location === "global" ? "gemini-embedding-2" : "gemini-embedding-001";
}

/** Vertex AI + ADC で @google/genai クライアントを生成する。 */
export function createVertexGenAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: getGoogleCloudProject(),
    location: getGoogleCloudLocation(),
  });
}

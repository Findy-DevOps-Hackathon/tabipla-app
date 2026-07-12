import { GoogleGenAI } from "@google/genai";

/** Vertex AI / ADC 経由で Gemini を使うか（ADK は GOOGLE_GENAI_USE_VERTEXAI も参照）。 */
export function usesVertexGemini(): boolean {
  const flag = process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());
}

export function getGoogleCloudProject(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT が未設定です。Vertex/ADC 利用時は gcloud config set project または .env を設定してください。",
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

/** スポットイラスト生成用 Vertex リージョン。画像モデルは regional 未提供のため global 既定。 */
export function getSpotImageLocation(): string {
  return process.env.SPOT_IMAGE_LOCATION?.trim() || "global";
}

/** 429 / 404 時に順に試すリージョン（重複除去）。 */
export function resolveSpotImageLocations(): string[] {
  const configured = process.env.SPOT_IMAGE_LOCATION_FALLBACK?.trim();
  const candidates = [getSpotImageLocation(), configured, "global", "us-central1"].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return [...new Set(candidates)];
}

/** Vertex AI + ADC（Application Default Credentials）で @google/genai クライアントを生成する。 */
export function createVertexGenAI(location = getGoogleCloudLocation()): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: getGoogleCloudProject(),
    location,
  });
}

/** スポットイラスト生成専用クライアント（画像モデルは global / us-central1 等）。 */
export function createSpotImageGenAI(): GoogleGenAI {
  return createVertexGenAI(getSpotImageLocation());
}

/** チャット系エージェントの Gemini モデル名（Vertex / AI Studio 共通）。 */
export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash";

/** Gemini 3.x が Vertex で利用できるリージョン（us-central1 等の単一リージョンは不可）。 */
const GEMINI_3_VERTEX_LOCATIONS = new Set([
  "global",
  "us",
  "eu",
  "asia-northeast1",
  "asia-south1",
  "asia-southeast1",
  "europe-west2",
]);

const DEFAULT_GEMINI_VERTEX_LOCATION = "asia-northeast1";

export function resolveChatModel(envKey: string, fallback: string): string {
  const value = process.env[envKey]?.trim();
  return value || fallback;
}

/** 全エージェント共通の既定モデル。 */
export const CHAT_MODEL = resolveChatModel("GEMINI_CHAT_MODEL", DEFAULT_CHAT_MODEL);

/** AIガイド（紹介エージェント）。未指定時は CHAT_MODEL と同じ。 */
export const INTRODUCE_MODEL = resolveChatModel("INTRODUCE_MODEL", CHAT_MODEL);

function usesGemini3Model(model: string): boolean {
  return /gemini-3(?:\.|$|-)/.test(model);
}

/** Gemini 3.x 利用時、非対応リージョンを自動で差し替える（ADK は GOOGLE_CLOUD_LOCATION を参照）。 */
export function ensureGeminiVertexLocation(): void {
  if (!usesGemini3Model(CHAT_MODEL)) return;

  const current = process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_GEMINI_VERTEX_LOCATION;
  if (GEMINI_3_VERTEX_LOCATIONS.has(current)) return;

  const fallback =
    process.env.GEMINI_VERTEX_LOCATION?.trim() || DEFAULT_GEMINI_VERTEX_LOCATION;
  console.warn(
    `[agent] GOOGLE_CLOUD_LOCATION=${current} は ${CHAT_MODEL} 非対応のため ${fallback} に切り替えます。` +
      " スポット画像は SPOT_IMAGE_LOCATION / SPOT_IMAGE_MODEL で別指定できます。",
  );
  process.env.GOOGLE_CLOUD_LOCATION = fallback;
}

ensureGeminiVertexLocation();

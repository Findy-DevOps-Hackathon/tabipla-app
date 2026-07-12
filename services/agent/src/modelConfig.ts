/** チャット系エージェントの Gemini モデル名（Gemini API / ADK 共通）。 */
export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash";

export function resolveChatModel(envKey: string, fallback: string): string {
  const value = process.env[envKey]?.trim();
  return value || fallback;
}

/** 全エージェント共通の既定モデル。 */
export const CHAT_MODEL = resolveChatModel("GEMINI_CHAT_MODEL", DEFAULT_CHAT_MODEL);

/** AIガイド（紹介エージェント）。未指定時は CHAT_MODEL と同じ。 */
export const INTRODUCE_MODEL = resolveChatModel("INTRODUCE_MODEL", CHAT_MODEL);

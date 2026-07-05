/** AIガイドが回答生成中に表示するプレースホルダ文言 */
export const AI_GUIDE_LOADING_TEXT = "考えています";

export function isAiGuideLoadingMessage(text: string): boolean {
  return text === AI_GUIDE_LOADING_TEXT || text === "💬 AIガイドが回答を作成中…";
}

/** LLM が返す Markdown 記法を除去し、チャット向けプレーンテキストに整える。 */
export function formatAiGuideAnswer(text: string): string {
  return text
    .replace(/^\s*[*•-]\s+/gm, "・")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

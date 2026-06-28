import type { LlmAgent } from "@google/adk";
import { InMemoryRunner, stringifyContent } from "@google/adk";

// エージェントに1メッセージ投げ、最終テキストを返す共通ヘルパ。
export async function ask(agent: LlmAgent, text: string, userId = "demo"): Promise<string> {
  if (process.env.USE_MOCK !== "0") {
    return `【モック回答】「${text}」に対するAIエージェントのダミー返答です。現在はデモモード（USE_MOCK=1）のため、Geminiは起動していません。`;
  }
  const runner = new InMemoryRunner({ agent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
  });

  let final = "";
  let errMsg = "";
  for await (const event of runner.runAsync({
    userId,
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text }] },
  })) {
    const e = event as { errorCode?: string; errorMessage?: string };
    if (e.errorCode) errMsg = `[${e.errorCode}] ${e.errorMessage ?? ""}`;
    // stringifyContent: thought(思考)パートを除いてテキストを連結。
    // 最後にテキストを伴ったイベントが最終回答。
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }
  if (final) return final;
  // テキストが無い＝モデル側エラー(429など)。呼び出し側で扱えるよう投げる。
  throw new Error(errMsg || "モデルから空の応答が返りました");
}

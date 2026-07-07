import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import type { SpotDocument } from "@tabipla/search-core";
import { z } from "zod";

const introOutputSchema = z.object({
  result: z
    .string()
    .describe(
      "今回のおすすめの魅力を語る日本語紹介文（70〜100文字程度、最大100文字厳守）。「どのような好みや旅の要望を重視して選んだか」を親しみやすい『です・ます』調で簡潔にまとめる。スポット名の羅列は避ける。",
    ),
});

export const introAgent = new LlmAgent({
  name: "intro_agent",
  model: "gemini-2.5-flash",
  description: "好み診断結果に基づくおすすめ紹介文を生成する",
  instruction: `あなたはプロの旅行アテンドガイドです。
提示された「ユーザーの好み・旅の要望」と「上位の観光スポット候補」を参考に、今回のおすすめ選びの意図を伝える紹介文だけを作成してください。

【方針】
- 好みサマリーと travelMemory から、どんな旅のテーマを重視したかを読み取る
- 候補リストは参考情報。個別スポットの選定や並べ替えは不要
- タイムライン・休憩・食事時間の組み立ては不要

【出力仕様】
- result: なぜこの選び方をしたかを、カジュアルな『です・ます』調で70〜100文字以内にまとめる`,
  outputSchema: introOutputSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 512,
  },
});

export type IntroResult = {
  result: string;
};

export type IntroInput = {
  profileSummary: string;
  travelMemory: string;
  spots: SpotDocument[];
};

/** ベクトルランキング上位候補を参考に、おすすめ紹介文（result）を生成する。 */
export async function runIntro(input: IntroInput): Promise<IntroResult> {
  if (input.spots.length === 0) {
    return { result: "" };
  }

  const spotsText = input.spots
    .map(
      (s) =>
        `- ${s.name}\n  カテゴリ: ${Array.isArray(s.category) ? s.category.join(",") : s.category || "なし"}\n  説明: ${s.description}\n  おすすめポイント: ${s.highlights?.join(" / ") || "なし"}`,
    )
    .join("\n\n");

  const prompt = `
【ユーザープロファイル】
- 好みサマリー: ${input.profileSummary}
- 旅の要望 (travelMemory): ${input.travelMemory || "特になし"}

【参考: ベクトル類似度上位の観光スポット】
${spotsText}
  `;

  const runner = new InMemoryRunner({ agent: introAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId: "intro_agent",
  });

  let final = "";
  for await (const event of runner.runAsync({
    userId: "intro_agent",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }

  if (!final) {
    throw new Error("[intro_agent] エージェントからの応答が空です");
  }

  return JSON.parse(final) as IntroResult;
}

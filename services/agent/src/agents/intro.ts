import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import type { SpotDocument } from "@tabipla/search-core";
import { z } from "zod";
import { BUBBLE_THEME_LIMIT } from "../personalize.js";

const introOutputSchema = z.object({
  result: z
    .string()
    .describe(
      "おすすめの選定理由を述べる日本語文（70〜100文字程度、最大100文字厳守）。ユーザーの好み・旅の要望に基づく理由だけを『です・ます』調で書く。観光地・施設・店の固有名詞は一切含めない。",
    ),
});

export const introAgent = new LlmAgent({
  name: "intro_agent",
  model: "gemini-3.5-flash",
  description: "好み診断結果に基づくおすすめ理由文を生成する",
  instruction: `あなたはプロの旅行アテンドガイドです。
ユーザーの好み診断結果をもとに、「診断からどんな好みが読み取れたか」を説明する理由文だけを作成してください。

【必須】
- 好みサマリーに含まれるカテゴリ・体験傾向（ベクトル類似度から要約された内容を含む）を言語化する
- 体験・サブテーマは最大${BUBBLE_THEME_LIMIT}つまでに絞って述べる（それ以上列挙しない）
- travelMemory があれば、それも選定理由に織り込む

【禁止】
- 観光地・施設・店・地名の固有名詞
- おすすめポイントの長文をそのまま引用する
- スポット列挙・行程提案

【出力仕様】
- result: 選定理由のみを、カジュアルな『です・ます』調で70〜100文字以内にまとめる`,
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

/** 上位候補の傾向だけを集計する（固有名詞は渡さない）。 */
function summarizeCandidateThemes(spots: SpotDocument[]): string {
  const catFreq = new Map<string, number>();
  const highlightFreq = new Map<string, number>();

  for (const spot of spots) {
    const categories = Array.isArray(spot.category)
      ? spot.category
      : spot.category
        ? [spot.category]
        : ["観光"];
    for (const category of categories) {
      catFreq.set(category, (catFreq.get(category) ?? 0) + 1);
    }
    for (const highlight of spot.highlights ?? []) {
      highlightFreq.set(highlight, (highlightFreq.get(highlight) ?? 0) + 1);
    }
  }

  const topCategories = [...catFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUBBLE_THEME_LIMIT)
    .map(([name]) => name);
  const topHighlights = [...highlightFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUBBLE_THEME_LIMIT)
    .map(([name]) => name);

  const lines: string[] = [];
  if (topCategories.length > 0) {
    lines.push(`- 候補に多いカテゴリ: ${topCategories.join("・")}`);
  }
  if (topHighlights.length > 0) {
    lines.push(`- 候補に多いテーマ: ${topHighlights.join("・")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "（候補の傾向は未取得）";
}

/** ベクトルランキング上位候補を参考に、おすすめ理由文（result）を生成する。 */
export async function runIntro(input: IntroInput): Promise<IntroResult> {
  if (input.spots.length === 0) {
    return { result: "" };
  }

  const themesText = summarizeCandidateThemes(input.spots);

  const prompt = `
【ユーザープロファイル】
- 好みサマリー: ${input.profileSummary}
- 旅の要望 (travelMemory): ${input.travelMemory || "特になし"}

【参考: 上位候補の傾向（固有名詞は意図的に省略）】
${themesText}

上記を参考に、スポット名を出さず「なぜこのような選び方をしたか」だけを result に書いてください。
体験・サブテーマは${BUBBLE_THEME_LIMIT}つ程度に絞り、長く列挙しないでください。
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

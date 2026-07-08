import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import type { SpotDocument } from "@tabipla/search-core";
import { z } from "zod";
import { CHAT_MODEL } from "../modelConfig.js";
import { BUBBLE_THEME_LIMIT } from "../personalize.js";

const introOutputSchema = z.object({
  result: z
    .string()
    .describe(
      "ユーザーに直接向けた好みの言い当て文（最大130文字厳守）。『です・ます』調。固有名詞は含めない。",
    ),
});

export const introAgent = new LlmAgent({
  name: "intro_agent",
  model: CHAT_MODEL,
  description: "好み診断結果に基づくおすすめ理由文を生成する",
  instruction: `あなたは、ユーザーの旅への想いに寄り添う旅行ガイドです。
好み診断の選び方をもとに、ワクワクやときめきが伝わる一文だけを書いてください。

【必須】
- ユーザーに直接向けて、感情が動く言葉で書く（「心が踊る」「ときめく」「行ってみたい」など）
- 好みサマリーの体験・サブテーマを、分析ではなく共感と言い当てで伝える
- 好みサマリーに「深層ニーズ」があれば、カテゴリ名ではなく旅で満たしたい感情として自然に織り込む
- 体験・サブテーマは最大${BUBBLE_THEME_LIMIT}つまで。列挙より「心に残る」表現を優先
- travelMemory があれば、想いや気持ちとして自然に織り込む

【禁止】
- 観光地・施設・店・地名の固有名詞
- 「傾向がありました」「読み取りました」「見えてきました」など事務的・分析調の表現
- おすすめポイントの長文引用、スポット列挙、行程提案

【出力仕様】
- result: 温かみのある『です・ます』調で最大130文字以内
- 良い例: 「城や古い街並みに、懐かしさとワクワクを感じる方ですね。」`,
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

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseIntroResult(text: string): IntroResult {
  const stripped = stripJsonFence(text);
  try {
    return introOutputSchema.parse(JSON.parse(stripped));
  } catch {
    const objectMatch = stripped.match(/\{[\s\S]*\}/);
    if (!objectMatch) throw new Error("[intro_agent] JSON 形式の応答を解析できませんでした");
    return introOutputSchema.parse(JSON.parse(objectMatch[0]));
  }
}

/** 上位候補の体験傾向だけを集計する（固有名詞・大カテゴリは渡さない）。 */
function summarizeCandidateThemes(spots: SpotDocument[]): string {
  const highlightFreq = new Map<string, number>();

  for (const spot of spots) {
    for (const highlight of spot.highlights ?? []) {
      highlightFreq.set(highlight, (highlightFreq.get(highlight) ?? 0) + 1);
    }
  }

  const topHighlights = [...highlightFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BUBBLE_THEME_LIMIT)
    .map(([name]) => name);

  if (topHighlights.length > 0) {
    return `- 候補に多い体験テーマ: ${topHighlights.join("・")}`;
  }
  return "（候補の傾向は未取得）";
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

上記を参考に、スポット名を出さず、ワクワクやときめきが伝わる一文を result に書いてください。
体験・サブテーマは${BUBBLE_THEME_LIMIT}つ程度に絞り、分析調ではなく感情に訴えるトーンにしてください。
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

  return parseIntroResult(final);
}

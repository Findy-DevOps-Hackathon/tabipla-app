import { LlmAgent, InMemoryRunner, stringifyContent } from "@google/adk";
import { z } from "zod";
import { KOMORO_SPOTS } from "../fixtures/spots.js";

const feedbackOutputSchema = z.object({
  feedbackNotes: z.string(),
  introStyle: z.string(),
});

// フィードバックエージェント：ユーザーの評価やコメントを分析し、推薦の好みメモや紹介スタイルガイドを更新する。
export const feedbackAgent = new LlmAgent({
  name: "feedback_agent",
  model: "gemini-2.5-flash",
  description: "ユーザーフィードバックの分析とプロファイル更新",
  instruction: `あなたは旅行エージェントシステムの学習・フィードバックエンジンです。
今回の旅行プランに対するユーザーのスポットごとのGood/Bad評価や、終了後の全体評価（星・コメント）を分析し、ユーザーの「推薦に対する好み傾向（feedbackNotes）」および「紹介の解説スタイル（introStyle）」を最新の内容に更新・蓄積してください。

【更新のガイドライン】
- feedbackNotes（推薦用）: 
  ユーザーが何を好むか、または嫌うかの傾向を自然文で簡潔に記述します。
  例：「歴史的なスポットはマイナーな寺社仏閣を好み、定番 of 公園はあまり興味を示さない。価格はリーズナブルさを重視。」
  今回のフィードバックを元に、過去のメモを上書き・統合・修正してください。
- introStyle（紹介用）:
  紹介エージェントが解説する際の切り口やトーンを記述します。
  例：「歴史的な背景や物語を深く知りたいが、説明は箇条書きで簡潔に。グルメ情報は具体的かつ実用的な体験談を求める。」
  ユーザーのコメントから、「説明が長すぎた」「もっと別の切り口で話してほしい」などの不満や要望を反映してください。

【出力フォーマット】
必ず指定されたJSON構造で出力してください。`,
  outputSchema: feedbackOutputSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 }
  }
});

export interface FeedbackInput {
  currentFeedbackNotes: string;
  currentIntroStyle: string;
  spotFeedbacks: { spotId: string; rating: "good" | "bad" }[];
  tripFeedback?: { rating: number; comment: string };
}

export interface FeedbackResult {
  feedbackNotes: string;
  introStyle: string;
}

export async function analyzeFeedback(input: FeedbackInput, userId = "demo"): Promise<FeedbackResult> {
  const runner = new InMemoryRunner({ agent: feedbackAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
  });

  // スポットIDからスポット名への変換
  const spotNameMap = new Map(KOMORO_SPOTS.map((s) => [s.id, s.name]));
  const formattedSpotFeedbacks = input.spotFeedbacks.map((f) => ({
    spotName: spotNameMap.get(f.spotId) || f.spotId,
    rating: f.rating,
  }));

  const requestText = `
【現在のプロファイル学習データ】
- 推薦の好みメモ (feedbackNotes): ${input.currentFeedbackNotes || "未設定"}
- 紹介の解説スタイル (introStyle): ${input.currentIntroStyle || "未設定"}

【今回のフィードバック】
- おすすめスポットに対する個別評価:
${JSON.stringify(formattedSpotFeedbacks, null, 2)}

- 旅行全体の評価とコメント:
${input.tripFeedback ? `評価（1-5）: ${input.tripFeedback.rating}\nコメント: ${input.tripFeedback.comment}` : "なし"}

これらのフィードバックを基に、よりユーザーに最適化された推薦ができるように feedbackNotes を、より好みに合った解説ができるように introStyle を更新・精緻化してください。
`;

  let final = "";
  let errMsg = "";

  for await (const event of runner.runAsync({
    userId,
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: requestText }] },
  })) {
    const e = event as { errorCode?: string; errorMessage?: string };
    if (e.errorCode) errMsg = `[${e.errorCode}] ${e.errorMessage ?? ""}`;
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }

  if (!final) {
    throw new Error(errMsg || "フィードバックエージェントから空の応答が返りました");
  }

  try {
    const parsed = JSON.parse(final) as FeedbackResult;
    return parsed;
  } catch (e) {
    throw new Error("フィードバック結果のJSONパースに失敗しました: " + final);
  }
}

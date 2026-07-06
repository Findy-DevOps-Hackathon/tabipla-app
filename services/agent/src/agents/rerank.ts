import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { z } from "zod";
import type { SpotDocument } from "@tabipla/search-core";

// LLM採点用の出力スキーマ
const rerankOutputSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string().describe("観光スポットのID"),
      desireScore: z
        .number()
        .min(1)
        .max(10)
        .describe("感性評価 (Desire): ユーザーの好みプロファイル・思い出文脈への適合度 (1〜10)"),
      realityScore: z
        .number()
        .min(1)
        .max(10)
        .describe("実用性評価 (Reality): 時間予算・出発地・価格帯などの物理的・現実的制約への適合度 (1〜10)"),
    })
  ),
});

// アンサンブル・リランキング評価器エージェント
export const rerankAgent = new LlmAgent({
  name: "rerank_agent",
  model: "gemini-2.5-flash",
  description: "観光地スポットの感性と実用性の同時スコアリング評価",
  instruction: `あなたは旅行プラン選定の推薦評価エージェントです。
提示された「ユーザーのプロファイル・文脈」と「観光地候補リスト」をもとに、2つの独立したペルソナ（ロール）から各観光地を 1〜10 の整数（1: 最悪, 10: 最適）で同時に評価してください。

【ペルソナ1: 感性評価 (Desire Agent)】
- ユーザーの「好きなジャンル・タグの傾向」や「旅行への思い・思い出コメント（travelMemory）」に対して、スポットの雰囲気や魅力、体験内容が心理的・感性的にどれだけ合致しているかを採点します。
- 例えば、自然や絶景を好むユーザーに「上高地」は高いDesireスコアを与えますが、歴史に興味がないユーザーに「清水寺」は低いスコアになります。

【ペルソナ2: 実用性評価 (Reality Agent)】
- ユーザーの「時間予算（timeBudget）」「出発地（origin）」といった物理的・時間的制約、価格帯、および移動経路や他の候補スポットとのバランスから、そのスポットが実用的にどれだけ適しているかを採点します。
- 例えば、時間予算が短い場合、遠すぎるスポットや、滞在時間が数時間必要な大規模スポットのRealityスコアは低くなります。

【入力形式】
- ユーザープロファイル
- 観光地候補のリスト

すべての候補スポットに対して、それぞれの評価スコアを決定し、指定された JSON スキーマに沿って返してください。`,
  outputSchema: rerankOutputSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 2048,
  },
});

export type RerankScoreEntry = {
  id: string;
  desireScore: number;
  realityScore: number;
  finalScore: number;
};

export type RerankInput = {
  profileSummary: string;
  travelMemory: string;
  timeBudget: string;
  origin: string;
  spots: SpotDocument[];
};

/**
 * 観光地リストに対し、Desire と Reality の2つの視点から採点を行ってリランキングする
 */
export async function runRerank(input: RerankInput): Promise<RerankScoreEntry[]> {
  if (input.spots.length === 0) return [];

  // スポット情報をLLMに入力しやすいテキスト形式に成形する
  const spotsText = input.spots
    .map(
      (s) =>
        `- ID: ${s.id}\n  名称: ${s.name}\n  カテゴリ: ${Array.isArray(s.category) ? s.category.join(",") : s.category || "なし"}\n  説明: ${s.description}\n  タグ: ${s.tags?.join(",") || "なし"}\n  価格: ${s.price ?? 0}円`
    )
    .join("\n\n");

  const prompt = `
【ユーザープロファイル】
- 好みサマリー: ${input.profileSummary}
- 思い出コメント (travelMemory): ${input.travelMemory || "特になし"}
- 時間予算 (timeBudget): ${input.timeBudget}
- 出発地 (origin): ${input.origin}

【観光地候補リスト】
${spotsText}
  `;

  // ADK を用いてエージェントセッションを実行
  const runner = new InMemoryRunner({ agent: rerankAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId: "reranker",
  });

  let final = "";
  for await (const event of runner.runAsync({
    userId: "reranker",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }

  if (!final) {
    throw new Error("[rerank] エージェントからの応答が空です");
  }

  // 構造化出力をパース
  const parsed = JSON.parse(final) as z.infer<typeof rerankOutputSchema>;

  // 加重平均スコアの算出 (Desire: 0.6, Reality: 0.4)
  const entries: RerankScoreEntry[] = parsed.scores.map((score) => {
    const finalScore = 0.6 * score.desireScore + 0.4 * score.realityScore;
    return {
      id: score.id,
      desireScore: score.desireScore,
      realityScore: score.realityScore,
      finalScore: Math.round(finalScore * 100) / 100, // 小数第二位に丸める
    };
  });

  // スコアの降順でソート
  return entries.sort((a, b) => b.finalScore - a.finalScore);
}

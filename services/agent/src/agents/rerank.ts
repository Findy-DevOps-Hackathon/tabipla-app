import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { z } from "zod";
import type { SpotDocument } from "@tabipla/search-core";

// 120点アテンドプランの構造化出力スキーマ
const attendPlanOutputSchema = z.object({
  planItems: z.array(
    z.object({
      type: z.enum(["spot", "break"]).describe("spot: 観光スポット, break: 食事・カフェ休憩などの余白・隠し味"),
      timeSlot: z.string().describe("その日の時間枠（例: '10:00 - 11:30', '12:00 - 13:00'）"),
      spotId: z.string().optional().describe("観光スポットID（type が spot の場合は必須）"),
      title: z.string().describe("観光地名、またはブレイクの種類（例: 'ランチタイム', 'カフェ散策休憩'）"),
      description: z.string().describe("この時間帯の過ごし方、ユーザーへの魅力的なストーリーやアピールポイント"),
    })
  ).describe("時系列で一筆書きに並べられた旅程のタイムライン"),
  
  result: z.string().describe("今回の旅程の魅力、ストーリーラインを語るワクワクする日本語アテンド紹介文（70〜100文字程度、最大100文字厳守）。「どのような要素やユーザーの好みを重視して今回のスポットを選んだのか」「どんなテーマの旅行を提案しているのか」を親しみやすいカジュアルなトーンで明確に言語化してください。「お客様」などの固い敬語は使用禁止です。単なるスポット名の羅列は厳禁です。"),
  
  subRecommendations: z.array(z.string()).describe("タイムラインに含まれなかった、その他のおすすめ観光スポットIDリスト（ユーザーの好みに近い順）"),
});

// 120点アテンド推薦エージェントの定義
export const attendPlannerAgent = new LlmAgent({
  name: "attend_planner_agent",
  model: "gemini-2.5-flash",
  description: "観光地のストーリーライン構築、セレンディピティ余白挿入、一筆書きルートおよび食事時間の最適化",
  instruction: `あなたは超一流のプロ旅行アテンドガイドであり、観光コンシェルジュです。
提示された「ユーザーの好み・旅の要望・時間枠・出発地」と「観光地候補リスト」をもとに、ユーザーが最も感動する【1つの完結した旅程プラン（タイムライン）】と【その他のおすすめスポット】を組み立ててください。

以下の3つの知的な役割を自律的に協調させてプランを作成してください：

【知的役割1: ストーリーテラー (Storyteller)】
- ユーザーの「好みサマリー」と「旅の要望 (travelMemory)」を元に、旅全体に一本の感情的なストーリーライン（テーマ）を設定します。
- 候補リスト（最大15件）から、そのテーマに最も合致するスポットを 2〜4 件厳選します。

【知的役割2: ローカルコンシェルジュ (Local Concierge)】
- 選ばれたスポットの間に、寄り道や余白として「カフェで小諸のローカル食材を楽しむ休憩」や「街並みの散策」などのブレイクタイム（type: 'break'）を1つ挿入し、旅程に心地よい緩急を与えます。

【知的役割3: ルートプランナー (Route Planner)】
- 出発地 (origin) からの移動を考慮し、最もスムーズな巡回順（一筆書きのルート）に時系列（タイムライン）でソートします。
- **食事時間（ランチ/ディナー）の考慮**:
  - 時間予算枠 (timeBudget) が「丸々一日 (1day)」または「半日 (half)」で、かつ昼（12:00〜13:30）や夕方（18:00〜19:30）をまたぐ旅程の場合、観光スポット候補に食事処（gourmet）が含まれていない場合であっても、**必ずタイムラインの適切な順番に『ランチタイム (1時間程度)』または『ディナータイム』のブレイク（type: 'break'）を挿入**してください。
  - 時間予算枠が「隙間時間 (short)」の場合は、食事は考慮せず、クイックに観光地のみを巡るプランにしてください。

【出力仕様】
- 'planItems' には、時系列に並べたスポットおよび休憩を格納します。
- 'result' には、今回のプランがユーザーのどのような好み（例: 歴史散策、景色の美しさ、ご当地グルメなど）や旅の要望を重視して構築されたのか、全体のストーリーやテーマ性などを、親しみのあるカジュアルで優しいトーンで簡潔にまとめた紹介文（70〜100文字程度、最大100文字厳守）を作成してください。「お客様」などの固い敬語は使用せず、フランクで温かみのある案内文にしてください。単にスポット名をカンマ区切りや箇条書きで羅列するだけの文章は絶対に避けてください。
- タイムラインに組み込めなかった残りの候補地の中から、ユーザーの好みに近いスポットID（最大 6 件）を好みの適合度順に 'subRecommendations' に格納してください。`,
  outputSchema: attendPlanOutputSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 2548,
  },
});

export type PlanItemEntry = {
  type: "spot" | "break";
  timeSlot: string;
  spotId?: string;
  title: string;
  description: string;
};

export type AttendPlanResult = {
  planItems: PlanItemEntry[];
  result: string;
  subRecommendations: string[];
};

export type RerankInput = {
  profileSummary: string;
  travelMemory: string;
  timeBudget: string;
  origin: string;
  spots: SpotDocument[];
};

/**
 * 観光地候補リストから、ストーリーテラー・コンシェルジュ・ルートプランナーの知性を協調させ、
 * 1本のタイムライン、アテンド要約、およびその他おすすめリストを生成する。
 */
export async function runRerank(input: RerankInput): Promise<AttendPlanResult> {
  if (input.spots.length === 0) {
    return { planItems: [], result: "", subRecommendations: [] };
  }

  // スポット情報をLLMに入力しやすいテキスト形式に成形
  const spotsText = input.spots
    .map(
      (s) =>
        `- ID: ${s.id}\n  名称: ${s.name}\n  カテゴリ: ${Array.isArray(s.category) ? s.category.join(",") : s.category || "なし"}\n  説明: ${s.description}\n  タグ: ${s.tags?.join(",") || "なし"}\n  価格: ${s.price ?? 0}円`
    )
    .join("\n\n");

  const prompt = `
【ユーザープロファイル】
- 好みサマリー: ${input.profileSummary}
- 旅の要望 (travelMemory): ${input.travelMemory || "特になし"}
- 時間予算枠 (timeBudget): ${input.timeBudget}
- 出発地 (origin): ${input.origin}

【観光スポット候補リスト】
${spotsText}
  `;

  // ADK を用いてエージェントセッションを実行
  const runner = new InMemoryRunner({ agent: attendPlannerAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId: "attend_planner",
  });

  let final = "";
  for await (const event of runner.runAsync({
    userId: "attend_planner",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }

  if (!final) {
    throw new Error("[attend_planner] エージェントからの応答が空です");
  }

  // 構造化出力をパースして返却
  return JSON.parse(final) as AttendPlanResult;
}

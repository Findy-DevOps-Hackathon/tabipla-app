import { LlmAgent, InMemoryRunner, stringifyContent } from "@google/adk";
import { z } from "zod";
import { KOMORO_SPOTS, SPOT_HOURS, SPOT_TAGS } from "../fixtures/spots.js";

const debateOutputSchema = z.object({
  debate: z.array(
    z.object({
      agent: z.enum(["recommend", "route", "introduce"]),
      message: z.string(),
    })
  ),
  finalSpots: z.array(z.string()),
  summary: z.string(),
});

// ディベートエージェント：推薦・ルート・紹介のエージェント間ディベートを生成し、合意されたプランを決定する。
export const debateAgent = new LlmAgent({
  name: "debate_agent",
  model: "gemini-2.5-flash",
  description: "旅行プランのディベート・合意形成",
  instruction: `あなたは旅行プランナーの対話（ディベート）を生成するコーディネーターです。
ユーザーの好み、旅行の時間猶予、出発地、過去のフィードバック、およびスポット情報に基づき、3名のエージェントになりきって議論（ディベート）を行ってください。
最終的に、時間内に収まり、ユーザーの好みに最もマッチする観光スポットのリストを合意してください。

【登場人物（エージェント）】
1. **推薦エージェント (recommend)**: ユーザーの好みのカテゴリやタグを最優先し、それに合致する魅力的なスポットを提案する役割。
2. **ルート計画エージェント (route)**: 出発地からの移動時間やスポット間の位置関係、滞在時間を計算し、時間予算内に収まるか、ルートが物理的に破綻していないかを指摘・チェックする役割。
3. **紹介エージェント (introduce)**: スポットのおすすめポイントや楽しみ方がユーザーの好み（introStyleなど）に合うかを評価し、滞在時間の調整や差し替え案を提案する役割。

【議論のルール】
- 議論は3〜5回程度の発言の往復（ディベート）で構成してください。
- 議論の流れ：
  - 推薦エージェントが好みに基づく初期候補地を提案。
  - ルートエージェントが移動時間や滞在時間の合計（時間猶予内か）をチェックし、問題があれば「遠すぎる」「時間が足りない」と指摘。
  - 紹介エージェントが、ユーザーの紹介スタイルや好みに合わせて、別のスポットを提案したり、滞在時間を調整するアイデアを提案。
  - 推薦エージェントがそれに合意し、最終的なおすすめスポットリストを決定する。
- 最終的に合意されたスポットIDのリストを finalSpots に入れてください。
- 議論の中に、具体的なスポット名や移動時間、滞在時間の数値を出し、あたかも本当に計画を練っているようにリアルに描写してください。

【出力フォーマット】
必ず指定されたJSON構造で出力してください。`,
  outputSchema: debateOutputSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 }
  }
});

export interface DebateResult {
  debate: { agent: "recommend" | "route" | "introduce"; message: string }[];
  finalSpots: string[];
  summary: string;
}

export interface DebateInput {
  userProfileSummary: string;
  feedbackNotes?: string;
  introStyle?: string;
  timeBudget: string; // e.g. "3時間", "6時間", "1日"
  origin: string;     // e.g. "小諸駅"
}

export async function runDebate(input: DebateInput, userId = "demo"): Promise<DebateResult> {
  const runner = new InMemoryRunner({ agent: debateAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
  });

  const spotsCatalog = KOMORO_SPOTS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    stayMin: SPOT_HOURS[s.id]?.stayMin ?? 60,
    tags: SPOT_TAGS[s.id] ?? [],
  }));

  const requestText = `
【旅行条件】
- 出発地: ${input.origin}
- 時間猶予（時間予算）: ${input.timeBudget}
- ユーザーの好み概要: ${input.userProfileSummary}
- 過去の推薦フィードバック（隠れた好み）: ${input.feedbackNotes || "特になし"}
- 過去の紹介フィードバック（紹介スタイル）: ${input.introStyle || "特になし"}

【利用可能なスポットカタログ（小諸）】
${JSON.stringify(spotsCatalog, null, 2)}

この条件を基に、推薦エージェント、ルート計画エージェント、紹介エージェントによるディベート対話を生成し、最終的なおすすめスポットリスト (finalSpots) を決定してください。
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
    throw new Error(errMsg || "ディベートエージェントから空の応答が返りました");
  }

  try {
    const parsed = JSON.parse(final) as DebateResult;
    return parsed;
  } catch (e) {
    throw new Error("ディベート結果のJSONパースに失敗しました: " + final);
  }
}

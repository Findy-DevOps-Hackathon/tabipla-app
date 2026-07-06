import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { z } from "zod";
import { KOMORO_SPOTS, SPOT_HOURS, SPOT_TAGS } from "../fixtures/spots.js";
import { CHAT_MODEL } from "../modelConfig.js";

const debateOutputSchema = z.object({
  debate: z.array(
    z.object({
      agent: z.enum(["recommend", "route", "introduce"]),
      thought: z
        .string()
        .describe(
          "エージェントの頭の中での詳細な計算、診断、選定理由、妥当性チェックなどの推敲思考プロセス",
        ),
      message: z
        .string()
        .describe(
          "対話ログ表示用の簡潔な発言（他エージェントへの1〜2文程度の極めて簡潔な提案や指摘、最大80文字程度）",
        ),
    }),
  ),
  finalSpots: z.array(z.string()),
  summary: z.string(),
});

// ディベートエージェント：推薦・ルート・紹介のエージェント間ディベートを生成し、合意されたプランを決定する。
export const debateAgent = new LlmAgent({
  name: "debate_agent",
  model: CHAT_MODEL,
  description: "旅行プランのディベート・合意形成",
  instruction: `あなたは旅行プランナーの対話（ディベート）を生成するコーディネーターです。
ユーザーの好み、旅行の時間猶予、出発地、過去のフィードバック、およびスポット情報に基づき、3名のエージェントになりきって議論（ディベート）を行ってください。
最終的に、時間内に収まり、ユーザーの好みに最もマッチする観光スポットのリストを合意してください。

【登場人物（エージェント）】
1. **推薦エージェント (recommend)**: ユーザーの好みのカテゴリやタグを最優先し、それに合致する魅力的なスポットを提案する役割。
2. **ルート計画エージェント (route)**: 出発地からの移動時間やスポット間の位置関係、滞在時間を計算し、時間予算内に収まるか、ルートが物理的に破綻していないかを指摘・チェックする役割。
3. **紹介エージェント (introduce)**: スポットのおすすめポイントや楽しみ方がユーザーの好み（introStyleなど）に合うかを評価し、滞在時間の調整や差し替え案を提案する役割。

【議論のルール】
- 議論は各エージェントが順に1回ずつ発言する全3回の往復（推薦の提案 -> ルートの検証・指摘 -> 紹介の修正提案と合意）で構成してください。
- 議論の際、まず \`thought\`（思考プロセス）で、スポットカタログの詳細情報（滞在時間、移動時間、ユーザープロファイルなど）を照らし合わせた綿密な計算や分析を十分に行い、
- その後、\`message\` に、他エージェントに語りかける「簡潔な発言（1〜2文程度、最大80文字程度）」を出力してください（裏での複雑な検討や計算結果は \`thought\` に書き、\`message\` には長文を載せないでください）。
- 最終的に合意されたスポットIDのリストを finalSpots に入れてください。
- 議論の中に、具体的なスポット名や移動時間、滞在時間の数値を出し、あたかも本当に計画を練っているようにリアルに描写してください。

【出力フォーマット】
必ず指定されたJSON構造で出力してください。`,
  outputSchema: debateOutputSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 2048,
  },
});

export interface DebateResult {
  debate: { agent: "recommend" | "route" | "introduce"; thought: string; message: string }[];
  finalSpots: string[];
  summary: string;
}

export interface DebateInput {
  userProfileSummary: string;
  feedbackNotes?: string;
  introStyle?: string;
  timeBudget: string; // e.g. "3時間", "6時間", "1日"
  origin: string; // e.g. "小諸駅"
  travelMemory?: string;
}

export async function runDebate(input: DebateInput, userId = "demo"): Promise<DebateResult> {
  if (process.env.USE_MOCK !== "0") {
    const picks = KOMORO_SPOTS.slice(0, 3);
    const pickNames = picks.map((s) => s.name).join("、");
    return {
      debate: [
        {
          agent: "recommend",
          thought: `ユーザーの好みを考慮し、${pickNames} を推薦します。`,
          message: `${pickNames} の3箇所をベースに提案します！`,
        },
        {
          agent: "route",
          thought: `${input.origin} 発として、3箇所は小諸市内で移動しやすく、時間予算内に収まります。`,
          message: "ルートチェック完了。移動時間・滞在時間ともに問題ありません。",
        },
        {
          agent: "introduce",
          thought: "紹介スタイルに合わせ、各スポットの魅力をバランスよく組み合わせてまとめます。",
          message: "3箇所を巡る小諸プランで合意しましょう！",
        },
      ],
      finalSpots: picks.map((s) => s.id),
      summary: `${pickNames} を巡る、小諸の定番観光プランです。`,
    };
  }
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
- ユーザーの思い出に残っている旅行（この傾向や体験を今回の推薦にも考慮してください）: ${input.travelMemory || "特になし"}

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

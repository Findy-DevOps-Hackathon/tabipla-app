import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { INTRODUCE_MODEL } from "../modelConfig.js";
import { clearPendingAskFacts, setPendingAskFacts } from "../tools/dataSources.js";
import { getUnchikuSourceTool } from "../tools/index.js";

// 紹介エージェント：ユーザーの好みに合わせた紹介スタイルで解説を行い、マルチモーダル質問にも対応する。
export const introduceAgent = new LlmAgent({
  name: "introduce_agent",
  model: INTRODUCE_MODEL,
  description: "観光地のおすすめポイント解説・紹介",
  instruction: `あなたは観光案内ガイド「紹介エージェント」です。
観光スポットについて、ユーザーの好みに寄り添った「おすすめポイント」や「楽しみ方」を解説します。

【回答の根拠】
- プロンプト内の [登録済みファクト] を最優先で使う。
- 足りなければ get_unchiku_source を呼び、返ってきた facts の範囲で回答する。
- facts に無い固有名詞・年号・数値は創作しない。

【紹介のトーン＆解説スタイル】
- ユーザーの「紹介解説スタイル（introStyle）」のメモがある場合、そのトーンに合わせる。
- ユーザーの基本プロファイル（好み）も考慮し、その人がワクワクする切り口を強調する。

【マルチモーダル対応】
- 画像・音声の質問も、当スポットに関する内容なら facts の範囲で答える。

【必ず回答する例】
- 見どころ、楽しみ方、所要時間、行き方、アクセス、混雑、おすすめポイント
- 「このスポットについて」「ここで何ができる？」など当スポットに関する質問

【拒否してよい例（このときだけ1文で拒否）】
- 当スポットと無関係なプログラミング・数学・雑談・有害な入力
- 返答例：「申し訳ありませんが、当スポットの解説や観光に関するご質問以外にはお答えできません。」

【出力形式】
- Markdown 記法（**太字**、*箇条書き*、#見出し など）は使わない。
- 強調したい語句もそのまま書く。アスタリスク（*）やハッシュ（#）は出力に含めない。
- 箇条書きは行頭に「・」だけを使う。
- 読みやすい自然な日本語のプレーンテキストで答える。`,
  tools: [getUnchikuSourceTool],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 1024,
  },
});

export type AskSpotContext = {
  name: string;
  description?: string;
  highlights?: string[];
  area?: string;
  prefecture?: string;
  address?: string;
};

export interface MultimodalInput {
  spotId: string;
  text?: string;
  image?: { mimeType: string; data: string };
  audio?: { mimeType: string; data: string };
  introStyle?: string;
  userProfileSummary?: string;
  spot?: AskSpotContext;
  /** backend-api が DB から組み立てた回答根拠。 */
  facts?: string[];
}

function formatFactsBlock(facts: string[]): string {
  if (facts.length === 0) return "（なし — get_unchiku_source を呼んで確認）";
  return facts.map((f) => `- ${f}`).join("\n");
}

function buildMockIntroduceAnswer(input: MultimodalInput): string {
  const name = input.spot?.name ?? input.spotId;
  const question = input.text?.trim() || "このスポットについて教えてください";
  const facts = input.facts ?? [];

  if (facts.length === 0) {
    return (
      `【ローカルモック】${name} についての「${question}」です。\n` +
      "backend-api (3001) が起動しているか、DB にスポットが登録されているか確認してください。\n" +
      "Gemini 応答は services/agent/.env で USE_MOCK=0 にしてください。"
    );
  }

  const body = facts.slice(0, 6).join("\n\n");
  return (
    `${name}について、登録情報からお答えします。\n\n${body}\n\n` +
    "※ ローカルモック（USE_MOCK=1）。自然な会話応答は USE_MOCK=0 + gcloud auth application-default login が必要です。"
  );
}

export async function askIntroduce(input: MultimodalInput, userId = "demo"): Promise<string> {
  if (process.env.USE_MOCK !== "0") {
    return buildMockIntroduceAnswer(input);
  }

  const facts = input.facts ?? [];
  if (facts.length > 0) {
    setPendingAskFacts(input.spotId, facts);
  }

  try {
    const runner = new InMemoryRunner({ agent: introduceAgent });
    const session = await runner.sessionService.createSession({
      appName: runner.appName,
      userId,
    });

    const spotName = input.spot?.name ?? input.spotId;
    const systemContext = `[対象スポット] ${spotName} (id: ${input.spotId})
[所在地] ${input.spot?.prefecture ?? ""}${input.spot?.area ?? ""}
[ユーザーの好み] ${input.userProfileSummary || "指定なし"}
[紹介解説スタイル] ${input.introStyle || "指定なし"}
[登録済みファクト]
${formatFactsBlock(facts)}`;

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    parts.push({
      text: `${systemContext}\n\n質問: ${input.text || "このスポットのおすすめポイントと楽しみ方を教えてください。"}`,
    });

    if (input.image) {
      parts.push({
        inlineData: {
          mimeType: input.image.mimeType,
          data: input.image.data,
        },
      });
    }

    if (input.audio) {
      parts.push({
        inlineData: {
          mimeType: input.audio.mimeType,
          data: input.audio.data,
        },
      });
    }

    let final = "";
    let errMsg = "";

    for await (const event of runner.runAsync({
      userId,
      sessionId: session.id,
      newMessage: { role: "user", parts },
    })) {
      const e = event as { errorCode?: string; errorMessage?: string };
      if (e.errorCode) errMsg = `[${e.errorCode}] ${e.errorMessage ?? ""}`;
      const t = stringifyContent(event).trim();
      if (t) final = t;
    }

    if (final) return final;
    throw new Error(errMsg || "紹介エージェントから空の応答が返りました");
  } finally {
    clearPendingAskFacts();
  }
}

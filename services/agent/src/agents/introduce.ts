import { GOOGLE_SEARCH, InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { INTRODUCE_MODEL } from "../modelConfig.js";

const INTRODUCE_ANSWER_MAX = 200;

function sanitizeIntroduceAnswer(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, INTRODUCE_ANSWER_MAX);
}

// 紹介エージェント：ユーザーの好みに合わせた紹介スタイルで解説を行い、マルチモーダル質問にも対応する。
export const introduceAgent = new LlmAgent({
  name: "introduce_agent",
  model: INTRODUCE_MODEL,
  description: "観光地のおすすめポイント解説・紹介",
  instruction: `あなたは観光案内ガイド「紹介エージェント」です。
観光スポットについて、ユーザーの好みに寄り添った「おすすめポイント」や「楽しみ方」を解説します。

【回答の根拠】
- まずプロンプト内の [登録済みファクト] を優先して使う。
- 質問が当スポットに関係あるのに、facts だけでは答えられないときは google_search でWebから情報を調べてよい。
- 検索クエリは当スポットに絞る（例:「{都道府県}{エリア} {スポット名}」「{スポット名} アクセス」「{スポット名} 楽しみ方」）。
- 検索結果は、対象スポットと所在地が一致すると確認できる情報だけを使う。他地域の同名・類似スポットは混同しない。
- facts も検索結果も無い固有名詞・年号・数値は創作しない。確認できなければ「その点はわからない」と正直に伝える。

【紹介のトーン＆解説スタイル】
- 親しみやすいタメ語（「〜だよ」「〜してみて」「〜なんだ」など）で話す。敬語（です・ます調）は使わない。
- 絵文字・顔文字・記号アイコンは一切使わない。
- 回答は200文字以内に収める。長くなりそうなら要点だけに絞る。
- ユーザーの「紹介解説スタイル（introStyle）」のメモがある場合、その切り口に合わせる（タメ語・200文字以内・絵文字なしは必ず守る）。
- ユーザーの基本プロファイル（好み）も考慮し、その人がワクワクする切り口を強調する。

【マルチモーダル対応】
- 画像・音声の質問も、当スポットに関する内容なら facts または Web検索の範囲で答える。

【必ず回答する例】
- 見どころ、楽しみ方、所要時間、行き方、アクセス、混雑、おすすめポイント
- 「このスポットについて」「ここで何ができる？」など当スポットに関する質問

【拒否してよい例（このときだけ1文で拒否）】
- 当スポットと無関係なプログラミング・数学・雑談・有害な入力
- 返答例：「ごめんね、ここの説明や観光の質問以外には答えられないんだ。」

【出力形式】
- 回答全体は200文字以内。絵文字は使わない。
- Markdown 記法（**太字**、*箇条書き*、#見出し など）は使わない。
- 強調したい語句もそのまま書く。アスタリスク（*）やハッシュ（#）は出力に含めない。
- 箇条書きは行頭に「・」だけを使う。
- 読みやすい自然な日本語のプレーンテキストで答える。`,
  tools: [GOOGLE_SEARCH],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 512 },
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
  if (facts.length === 0) return "（なし）";
  return facts.map((f) => `- ${f}`).join("\n");
}

export async function askIntroduce(input: MultimodalInput, userId = "demo"): Promise<string> {
  const facts = input.facts ?? [];

  const runner = new InMemoryRunner({ agent: introduceAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
  });

  const spotName = input.spot?.name ?? input.spotId;
  const location = `${input.spot?.prefecture ?? ""}${input.spot?.area ?? ""}`.trim();
  const systemContext = `[対象スポット] ${spotName} (id: ${input.spotId})
[所在地] ${location || "不明"}
[ユーザーの好み] ${input.userProfileSummary || "指定なし"}
[紹介解説スタイル] ${input.introStyle || "指定なし"}
[登録済みファクト]
${formatFactsBlock(facts)}
[補足] facts で足りないときは、上記スポット名・所在地に絞って google_search してよい。`;

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

  if (final) return sanitizeIntroduceAnswer(final);
  throw new Error(errMsg || "紹介エージェントから空の応答が返りました");
}

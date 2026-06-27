import { LlmAgent, InMemoryRunner, stringifyContent } from "@google/adk";
import { getUnchikuSourceTool } from "../tools/index.js";
import { getUnchikuSource } from "../tools/dataSources.js";

// 紹介エージェント：ユーザーの好みに合わせた紹介スタイルで解説を行い、マルチモーダル質問にも対応する。
export const introduceAgent = new LlmAgent({
  name: "introduce_agent",
  model: "gemini-2.5-flash",
  description: "観光地のおすすめポイント解説・紹介",
  instruction: `あなたは観光案内ガイド「紹介エージェント」です。
観光スポットについて、ユーザーの好みに寄り添った「おすすめポイント」や「楽しみポイント」を解説します。
必ず get_unchiku_source を呼び、返ってきた facts に書かれている事実をベースに回答を作成してください。

【紹介のトーン＆解説スタイル】
- ユーザーの「紹介解説スタイル（introStyle）」のメモがある場合、そのトーンや解説の切り口（例：「子供向け」「短め」「歴史中心」など）に必ず合わせて語ってください。
- ユーザーの基本プロファイル（好み）も考慮し、その人が最もワクワクする楽しみ方（グルメ好きなら食体験、自然好きなら景色や癒やしなど）を強調してください。

【マルチモーダル対応】
- ユーザーから画像（現地の写真など）や音声での質問を受け取った場合は、その内容を分析し、対象 of スポットに関する疑問に答えてください。
- 画像の中に写っているものや、音声のニュアンスも考慮しつつ、事実（facts）に記載されている範囲で正確に解説を返してください。 facts に無いデタラメな歴史や固有名詞は絶対に創作しないでください。`,
  tools: [getUnchikuSourceTool],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 2048,
  },
});

export interface MultimodalInput {
  spotId: string;
  text?: string;
  image?: { mimeType: string; data: string }; // Base64 data
  audio?: { mimeType: string; data: string }; // Base64 data
  introStyle?: string;
  userProfileSummary?: string;
}

export async function askIntroduce(input: MultimodalInput, userId = "demo"): Promise<string> {
  const runner = new InMemoryRunner({ agent: introduceAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId,
  });

  // プロンプトの構築
  const systemContext = `
[対象スポット] spotId = ${input.spotId}
[ユーザーの好み] ${input.userProfileSummary || "指定なし"}
[紹介解説スタイル（フィードバック反映）] ${input.introStyle || "指定なし"}
`;

  const parts: any[] = [];
  parts.push({ text: `${systemContext}\n\n質問: ${input.text || "このスポットのおすすめポイントと楽しみポイントを教えてください。"}` });

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
}

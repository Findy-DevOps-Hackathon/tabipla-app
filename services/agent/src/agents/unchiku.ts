import { LlmAgent } from "@google/adk";
import { getUnchikuSource } from "../tools/dataSources.js";
import { getUnchikuSourceTool } from "../tools/index.js";
import { ask } from "./run.js";

// A6: 蘊蓄エージェント。factsの外を語らせない抑制ガード付き。
export const unchikuAgent = new LlmAgent({
  name: "unchiku_agent",
  model: "gemini-2.5-flash",
  description: "観光蘊蓄の生成",
  instruction: `あなたは観光案内人。必ず get_unchiku_source を呼び、
返ってきた facts に書かれている内容【のみ】を使って蘊蓄を書く。
facts に無い固有名詞・年号・数値は絶対に追加しない。
facts が空なら「語れる確かな話がない」と正直に返す。`,
  tools: [getUnchikuSourceTool],
  // 思考で出力予算を使い切って空応答になるのを防ぐ
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 1024,
  },
});

export async function story(spotId: string): Promise<string> {
  const src = await getUnchikuSource({ spotId }); // 検証用に先取り
  const text = await ask(unchikuAgent, `spotId=${spotId} の蘊蓄を書いて`);
  if (!passesGuard(text, src.facts)) {
    throw new Error("unchiku guard tripped — facts外の内容が混入");
  }
  return text;
}

// 初期は軽く：出力中の数字(年号など)がfacts側に存在するか。A8で精度を上げる。
function passesGuard(text: string, facts: string[]): boolean {
  const src = facts.join(" ");
  const nums = text.match(/\d{2,4}/g) ?? [];
  return nums.every((n) => src.includes(n));
}

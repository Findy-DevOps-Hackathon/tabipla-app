import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { getUnchikuSource, search, travelTimes } from "./dataSources.js";
import { checkToolLoop } from "./tracker.js";

// FunctionTool は Zod スキーマでツールを宣言。
// execute はデータ層(dataSources)を呼ぶだけ。mock↔本物の切替はそちらで吸収される。

export const searchSpotsTool = new FunctionTool({
  name: "search_spots",
  description: "条件に合う候補スポットを返す",
  parameters: z.object({
    query: z.string().describe("自然文の検索意図（雰囲気・目的など。条件で表せない部分）"),
    category: z
      .array(z.enum(["nature", "gourmet", "history"]))
      .optional()
      .describe("カテゴリ（OR）。nature/gourmet/history のみ"),
    k: z.number().optional().describe("取得件数（既定8）"),
  }),
  execute: async (args) => {
    const loopError = checkToolLoop("search_spots", args);
    if (loopError) return loopError;
    return { status: "success", spots: await search(args) };
  },
});

export const travelTimesTool = new FunctionTool({
  name: "travel_times",
  description: "出発地から各スポットへの所要時間(秒)を返す",
  parameters: z.object({
    origin: z.object({ lat: z.number(), lon: z.number() }),
    destinations: z.array(
      z.object({
        id: z.string(),
        at: z.object({ lat: z.number(), lon: z.number() }),
      }),
    ),
    mode: z.enum(["walk", "drive", "transit"]),
  }),
  execute: async (args) => {
    const loopError = checkToolLoop("travel_times", args);
    if (loopError) return loopError;
    return { status: "success", times: await travelTimes(args) };
  },
});

export const getUnchikuSourceTool = new FunctionTool({
  name: "get_unchiku_source",
  description: "スポットの確かな出典facts。これ以外の事実は語らないこと。",
  parameters: z.object({ spotId: z.string() }),
  execute: async (args) => {
    const loopError = checkToolLoop("get_unchiku_source", args);
    if (loopError) return loopError;
    return await getUnchikuSource(args);
  },
});

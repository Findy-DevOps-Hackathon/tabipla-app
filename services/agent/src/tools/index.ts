import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { search } from "./dataSources.js";
import { checkToolLoop } from "./tracker.js";

// FunctionTool は Zod スキーマでツールを宣言。
// execute はデータ層(dataSources)を呼ぶだけ。

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

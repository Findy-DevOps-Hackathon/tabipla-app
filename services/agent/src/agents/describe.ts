import { GOOGLE_SEARCH, LlmAgent } from "@google/adk";
import { z } from "zod";
import { SPOT_CATEGORIES } from "../categories.js";

const DESCRIPTION_MAX = 200;
const HIGHLIGHT_MAX = 80;
const HIGHLIGHT_COUNT = 3;

export const describeResultSchema = z.object({
  description: z.string(),
  category: z.string().optional(),
  highlights: z.array(z.string()).default([]),
});

export type DescribeResult = z.infer<typeof describeResultSchema>;

export type DescribeMode = "description" | "highlights";

export type DescribeSpotInput = {
  name: string;
  municipality: string;
  prefecture: string;
  address?: string;
  mode?: DescribeMode;
};

export const describeAgent = new LlmAgent({
  name: "describe_agent",
  model: "gemini-2.5-flash",
  description: "指定自治体内の観光地1件について紹介文またはおすすめポイントを生成する",
  instruction: `あなたは観光地の紹介文とおすすめポイントを書くエージェントです。
指定された観光地名について、Google検索で情報を収集し、依頼された項目だけを作成します。
依頼が「紹介文のみ」「おすすめポイントのみ」の場合は、求められたフィールドだけをJSONに含める。

【手順】
1. google_search で「{都道府県}{市区町村名} {観光地名}」を検索する。
   必要なら「{観光地名} {市区町村名} 観光」などクエリを追加する。
2. 検索結果から、指定された市区町村・都道府県内にある同一スポットの情報だけを使う。
3. 依頼された項目を作成し、JSON形式で出力する。

【自治体スコープ（最重要）】
- 対象は「{都道府県}{市区町村名}」内のスポットのみ。他市区町村・他都道府県の同名・類似スポットの情報は絶対に使わない。
- 検索結果に「{市区町村名}」または「{都道府県}」とスポット名が共起する根拠がない場合、
  または住所・所在地が他自治体と判明する場合は、創作せず {"description":"","category":null,"highlights":[]} を返す。
- 他地域の観光地の説明を流用・混同しない。迷ったら空文字を返す。

【description（紹介文）の書き方】
- 100〜200字。複数ソースで確認できる事実だけで構成する。
- 宣伝的なキャッチコピーや誇張表現は禁止。
- 特定サイトの言い回しをそのまま引き写さない。事実を自分の構成で書き直す。
- 文体は「です・ます」調で統一。
- URLは含めない。

【category】
- 次のいずれか1つ。判断できなければ null — ${SPOT_CATEGORIES.map((c) => `"${c}"`).join(" | ")} | null

【highlights（おすすめポイント）】
- 必ず3件の文字列配列。各15〜60字。
- 紹介文と重複しない、訪問者が「ここが見どころ」「こう楽しむ」と分かる具体的なポイントにする。
- 例: 見どころ・ベストシーズン・楽しみ方・周辺との組み合わせなど、検索で確認できる事実に限定。
- 宣伝的なキャッチコピーは禁止。URLは含めない。
- 情報が足りない場合は件数を減らさず、確認できた事実だけで3件構成する。どうしても3件揃わない場合のみ空配列 [] とする。

【創作の禁止】
- 検索結果で存在・所在地が確認できないスポットの紹介文を書かない。
- 確認できない詳細は書かない。

【出力形式】
前置き・説明・コードフェンスは一切書かず、依頼に応じたJSONだけを出力する:
- 紹介文のみ: {"description":"...","category":"自然"}
- おすすめポイントのみ: {"highlights":["...","...","..."]}
- 両方（明示された場合のみ）: {"description":"...","category":"自然","highlights":["...","...","..."]}
見つからない・自治体外と判断した場合:
- 紹介文依頼: {"description":"","category":null}
- おすすめポイント依頼: {"highlights":[]}`,
  tools: [GOOGLE_SEARCH],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 512 },
    maxOutputTokens: 2048,
  },
});

function sanitizeText(text: string, max: number): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizeDescription(text: string): string {
  return sanitizeText(text, DESCRIPTION_MAX);
}

function sanitizeHighlights(items: string[]): string[] {
  return items
    .map((item) => sanitizeText(item, HIGHLIGHT_MAX))
    .filter(Boolean)
    .slice(0, HIGHLIGHT_COUNT);
}

export function parseDescribeResult(text: string): DescribeResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`エージェント出力にJSONが見つかりません: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  const partialSchema = z.object({
    description: z.string().optional().default(""),
    category: z.string().optional(),
    highlights: z.array(z.string()).optional().default([]),
  });
  const result = partialSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`紹介文の形式が不正です: ${result.error.message}`);
  }
  const category =
    result.data.category && (SPOT_CATEGORIES as readonly string[]).includes(result.data.category)
      ? result.data.category
      : undefined;
  return {
    description: sanitizeDescription(result.data.description),
    category,
    highlights: sanitizeHighlights(result.data.highlights),
  };
}

function buildDescribePrompt(input: DescribeSpotInput): string {
  const mode = input.mode ?? "description";
  const addressHint = input.address?.trim()
    ? `\n【補足】登録予定の住所: ${input.address.trim()}`
    : "";
  const base = `【観光地名】${input.name}
【都道府県】${input.prefecture}
【市区町村】${input.municipality}${addressHint}

上記市区町村内のスポットとして、検索で所在地を確認してから`;

  if (mode === "highlights") {
    return `次の観光地についておすすめポイント3件のみを作成してください（紹介文は不要）。

${base}おすすめポイントを書いてください。`;
  }

  return `次の観光地について紹介文のみを作成してください（おすすめポイントは不要）。

${base}紹介文を書いてください。`;
}

export async function describeSpot(
  input: DescribeSpotInput,
  runAgent: (prompt: string) => Promise<{ final: string; errMsg: string }>,
): Promise<DescribeResult> {
  const mode = input.mode ?? "description";

  if (process.env.USE_MOCK !== "0") {
    if (mode === "highlights") {
      return {
        description: "",
        highlights: [
          `【モック】${input.name}の見どころをゆっくり散策できます`,
          "季節ごとに表情が変わるのが魅力です",
          "周辺スポットと合わせて半日コースがおすすめです",
        ],
      };
    }
    return {
      description: sanitizeDescription(
        `【モック】${input.prefecture}${input.municipality}の「${input.name}」です。デモ用の紹介文です。`,
      ),
      category: "自然",
      highlights: [],
    };
  }

  const prompt = buildDescribePrompt(input);

  const { final, errMsg } = await runAgent(prompt);
  if (!final) {
    throw new Error(errMsg || "エージェントから空の応答が返りました");
  }

  return parseDescribeResult(final);
}

import { GOOGLE_SEARCH, LlmAgent } from "@google/adk";
import { z } from "zod";
import { SPOT_CATEGORIES } from "../categories.js";
import { CHAT_MODEL } from "../modelConfig.js";

// Gemini API の制約:
//   - outputSchema(JSON強制モード)はツールと併用できない
//   - 組み込み googleSearch とカスタム関数ツールの混在も拒否されることがある
// そのためツールは GOOGLE_SEARCH のみ・JSON出力はプロンプト指示 + zodバリデーションで担保する。

// モデルは name/description 以外のフィールドを取りこぼすことがある（特に件数が多いと後半で
// tags/sources 等が欠落しやすい）。欠落で収集全体を失敗させないよう、非必須項目には
// デフォルトを与える。必須は name/description のみ。
/** 1回の AI 収集で要求できる最大件数。 */
export const MAX_COLLECT_TARGET_COUNT = 50;

const DESCRIPTION_MAX = 200;
const HIGHLIGHT_MAX = 30;
const HIGHLIGHT_COUNT = 3;

function sanitizeText(text: string, max: number): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizeHighlights(items: string[]): string[] {
  return items
    .map((item) => sanitizeText(item, HIGHLIGHT_MAX))
    .filter(Boolean)
    .slice(0, HIGHLIGHT_COUNT);
}

function sanitizeSpot(spot: CollectedSpot): CollectedSpot {
  const description = sanitizeText(spot.description, DESCRIPTION_MAX);
  return { ...spot, description, highlights: sanitizeHighlights(spot.highlights) };
}

const spotSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  category: z.string().default("自然"),
  area: z.string().default(""),
  prefecture: z.string().default(""),
  address: z.string().default(""),
  tags: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
});

// 著作権ガード（機械的制御）:
//   説明文は200字以内に強制的に丸める。長文の丸写しはこの上限で物理的に通らない。
//   URLや連続空白も除去し、出典はsources(サイト名)でのみ扱う。

export const collectResultSchema = z.object({
  spots: z.array(spotSchema),
});

export type CollectedSpot = z.infer<typeof spotSchema>;
export type CollectResult = z.infer<typeof collectResultSchema>;

export const COLLECT_CATEGORIES = SPOT_CATEGORIES;

export type CollectCategory = (typeof COLLECT_CATEGORIES)[number];

export const collectAgent = new LlmAgent({
  name: "collect_agent",
  model: CHAT_MODEL,
  description: "指定エリアの観光地情報をWebから収集・構造化する",
  instruction: `あなたは観光データ収集エージェントです。
指定された市区町村の観光地情報をGoogle検索で収集し、構造化データとして出力します。

【手順】
1. google_search で市区町村名とカテゴリに応じたクエリを複数回検索する（例: 「{市区町村名} 自然 絶景」「{市区町村名} 歴史 史跡」「{市区町村名} 神社 仏閣」「{市区町村名} 美術館」「{市区町村名} 温泉」「{市区町村名} 直売所」「{市区町村名} 祭り イベント」など、指定カテゴリに合わせて切り口を変える）。
2. 検索結果からスポットを抽出し、指定のJSON形式で構造化する。
3. 同じスポットが複数ソースで言及されている場合は名寄せして1件にまとめる。
4. 目標件数に近づくよう、検索クエリのバリエーションを増やす（1回の収集は最大${MAX_COLLECT_TARGET_COUNT}件）。

【データ構造】
各スポットは以下のフィールドを持つ:
- name: スポット名（正式名称）
- description: 100〜200字の説明文。元の文章をそのままコピーせず、要約・再構成すること。
- highlights: おすすめポイント3件の文字列配列。各15〜30字。description と重複せず、見どころ・ベストシーズン・楽しみ方など具体的な事実に限定する。

【description（紹介文）の書き方】
- 複数の情報源を突き合わせ、共通して確認できる事実だけで構成する。
  1つのサイトにしか書かれていない誇張された情報は採用しない。
- 宣伝的なキャッチコピーや誇張表現は禁止。
  NG例: 「絶景の宝庫」「訪れる人を魅了する」「一度は行きたい」「インスタ映え」「至福のひととき」
- 特定サイトの言い回しをそのまま引き写さない。事実を自分の構成で書き直す。
- 書く内容の優先順位: ①それが何か（城跡・滝など） ②具体的な特徴（規模・歴史・見られるもの）
  ③楽しみ方や季節の情報（紅葉の時期など）。
- 文体は「です・ます」調で統一。
- highlights（おすすめポイント）: 必ず3件。宣伝的なキャッチコピーは禁止。URLは含めない。
- category: 次のいずれか1つだけを付与する — ${SPOT_CATEGORIES.map((c) => `"${c}"`).join(" | ")}
- area: 市区町村名
- prefecture: 都道府県名
- address: できるだけ正確な住所。不明なら "{都道府県}{市区町村名}" のみ
- tags: 特徴を表すタグ（3〜5個）例: ["紅葉","城址","公園"]
- sources: 情報を得たソースのサイト名（URLではなく「じゃらん」「小諸市公式HP」のような名称）

【自治体スコープ（最重要）】
- 対象はプロンプトで指定された市区町村・都道府県内の観光地のみ。
- 他市区町村・他都道府県の同名・類似スポットは出力しない。所在地が指定自治体外と判明するものは除外する。
- area / prefecture / address は必ず指定自治体内の情報だけを書く。

【最重要ルール：創作の絶対禁止】
- google_search の検索結果で実際に存在が確認できたスポットだけを出力する。
- 検索結果に現れないスポットを、推測・記憶・創作で出力することは絶対に禁止。
- 指定された市区町村が実在しない場合、または検索しても観光情報が見つからない場合は、
  必ず {"spots":[]} （空配列）を返す。
- 目標件数に届かなくても、絶対に創作で埋めない。件数より正確性を最優先する。
- sources には検索結果に実際に表示されたサイト名だけを書く。存在しないソース名を作らない。

【注意事項】
- 対象は「訪れて楽しむ観光地」のみ。飲食店・カフェ・宿泊施設・体験サービス単体は収集しない
  （ただし観光要素が主体の施設、例えば城跡・庭園・展望台・滝・神社仏閣・博物館などは対象）。
- 著作権のある文章をそのままコピーしない。必ず自分の言葉で要約・再構成する。
- 閉業・閉鎖が明記されているスポットは除外する。
- 情報の正確性を重視し、確認できない詳細は書かない。
- 有名観光地に偏らず、穴場も含めてバランスよく収集する。

【出力形式】
前置き・説明・コードフェンスは一切書かず、次の形のJSONだけを出力する:
{"spots":[{"name":"...","description":"...","highlights":["...","...","..."],"category":"自然","area":"...","prefecture":"...","address":"...","tags":["..."],"sources":["..."]}]}`,
  tools: [GOOGLE_SEARCH],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 1024 },
    maxOutputTokens: 16384,
  },
});

/**
 * モデル出力から JSON オブジェクト文字列を取り出す（コードフェンス・前置きに耐性）。
 */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) return inner;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeCollectResult(parsed: { spots?: unknown[] }): CollectResult {
  const rawSpots = Array.isArray(parsed?.spots) ? parsed.spots : [];
  const spots: CollectedSpot[] = [];
  for (const raw of rawSpots) {
    const result = spotSchema.safeParse(raw);
    if (result.success) {
      spots.push(sanitizeSpot(result.data));
    }
  }
  return { spots };
}

/**
 * モデル出力からJSONを取り出してバリデーションする（コードフェンスや前置きに耐性を持たせる）。
 *
 * スポットは1件ずつ検証し、必須項目（name/description）を満たすものだけ採用する。
 * 一部のスポットがフィールド欠落で不正でも、収集結果全体を失敗させない。
 */
export function parseCollectResult(text: string): CollectResult {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    throw new Error(`エージェント出力にJSONが見つかりません: ${text.slice(0, 200)}`);
  }
  let parsed: { spots?: unknown[] };
  try {
    parsed = JSON.parse(jsonText) as { spots?: unknown[] };
  } catch {
    throw new Error(`JSONの解析に失敗しました: ${text.slice(0, 200)}`);
  }
  return normalizeCollectResult(parsed);
}

/** Markdown 等の非JSON出力を構造化 JSON に変換する（google_search 非使用）。 */
export const collectFormatAgent = new LlmAgent({
  name: "collect_format_agent",
  model: CHAT_MODEL,
  description: "観光地テキストを構造化JSONに変換する",
  instruction: `あなたは観光データの整形エージェントです。
入力テキスト（Markdown・説明文を含む場合あり）から、実際に言及されている観光スポットだけを spots 配列に変換します。

【ルール】
- 入力に明示されていないスポットは追加しない（創作禁止）
- 各スポット: name, description(100〜200字), highlights(3件・各15〜30字), category, area, prefecture, address, tags, sources
- category は次のいずれか1つ — ${SPOT_CATEGORIES.map((c) => `"${c}"`).join(" | ")}
- 入力にスポットが見つからない場合は {"spots":[]}
- 指定スキーマのJSONのみ出力する`,
  outputSchema: collectResultSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 16384,
  },
});

/** parseCollectResult 失敗時に format agent で Markdown 等から復旧を試みる。 */
export async function resolveCollectResult(
  rawText: string,
  context: { prefecture: string; municipality: string },
  runAgent: (agent: LlmAgent, prompt: string) => Promise<{ final: string; errMsg: string }>,
): Promise<CollectResult> {
  try {
    return parseCollectResult(rawText);
  } catch (firstErr) {
    const formatPrompt = `【都道府県】${context.prefecture}
【市区町村】${context.municipality}

以下のテキストから、${context.prefecture}${context.municipality}内の観光スポットだけを抽出してJSON化してください。
テキストにないスポットは絶対に追加しないでください。

--- 入力テキスト ---
${rawText.slice(0, 14000)}`;

    const { final, errMsg } = await runAgent(collectFormatAgent, formatPrompt);
    if (!final) {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }

    try {
      return normalizeCollectResult(JSON.parse(final) as { spots?: unknown[] });
    } catch {
      return parseCollectResult(final);
    }
  }
}

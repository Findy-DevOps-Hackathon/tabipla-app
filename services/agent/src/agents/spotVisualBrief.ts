import { GOOGLE_SEARCH, InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { z } from "zod";
import { CHAT_MODEL } from "../modelConfig.js";

export type SpotVisualBriefInput = {
  name: string;
  prefecture: string;
  municipality: string;
  address?: string;
};

const visualBriefSchema = z.object({
  subject: z.string().max(80).default(""),
  keyElements: z.array(z.string().max(40)).max(6).default([]),
  atmosphere: z.string().max(120).default(""),
  composition: z.string().max(120).default(""),
  avoidElements: z.array(z.string().max(40)).max(6).default([]),
});

export type SpotVisualBrief = z.infer<typeof visualBriefSchema>;

export type SpotVisualBriefContext = {
  brief: SpotVisualBrief | null;
  wikipediaIntro: string | null;
};

const VISUAL_BRIEF_TIMEOUT_MS = 45_000;
const WIKI_FETCH_TIMEOUT_MS = 10_000;

const spotVisualBriefAgent = new LlmAgent({
  name: "spot_visual_brief_agent",
  model: CHAT_MODEL,
  description: "観光スポットのイラスト用ビジュアル要素を Google 検索で調査する",
  instruction: `指定された観光スポットについて、Google 検索で事実を調べ、イラスト生成用のビジュアル要素だけを JSON で返します。
紹介文・キャッチコピー・URL は不要です。画像に描くべき「見た目」だけを抽出します。

【手順】
1. プロンプトに Wikipedia 概要がある場合は最初に読む
2. google_search で「{都道府県}{市区町村} {スポット名}」「{スポット名} 公式」「{スポット名} {市区町村} 外観 写真」などを試す
3. 指定市区町村・都道府県内の同一スポットだけを対象にする
4. 公式サイト・観光協会・Wikipedia など複数ソースで確認できた視覚情報だけを使う

【自治体スコープ（最重要）】
- {都道府県}{市区町村} 内のスポットのみ。他地域の同名スポットは除外
- 所在地が他自治体と判明する情報は使わない
- 確認できない詳細は空にする。捏造しない

【各フィールド】
- subject: イラストの主役（1文・80字以内）
- keyElements: 描くべき具体要素 3〜6 件（建物形状・屋根・自然・施設の目立つ特徴）
- atmosphere: 光・季節・ムード（120字以内）
- composition: 構図の提案（120字以内）。カメラ位置・前景/中景/背景
- avoidElements: 描いてはいけないもの（混同しやすい別スポット、看板、文字、無関係な landmark）

【出力】
{"subject":"...","keyElements":["..."],"atmosphere":"...","composition":"...","avoidElements":["..."]}
見つからない場合: {"subject":"","keyElements":[],"atmosphere":"","composition":"","avoidElements":[]}`,
  outputSchema: visualBriefSchema,
  tools: [GOOGLE_SEARCH],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 512 },
    maxOutputTokens: 1024,
  },
});

function sanitizeBriefItem(text: string, max: number): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeBrief(raw: SpotVisualBrief): SpotVisualBrief | null {
  const subject = sanitizeBriefItem(raw.subject, 80);
  const keyElements = raw.keyElements
    .map((item) => sanitizeBriefItem(item, 40))
    .filter(Boolean)
    .slice(0, 6);
  const atmosphere = sanitizeBriefItem(raw.atmosphere, 120);
  const composition = sanitizeBriefItem(raw.composition, 120);
  const avoidElements = raw.avoidElements
    .map((item) => sanitizeBriefItem(item, 40))
    .filter(Boolean)
    .slice(0, 6);

  if (!subject && keyElements.length === 0 && !atmosphere && !composition) {
    return null;
  }

  return { subject, keyElements, atmosphere, composition, avoidElements };
}

function mergeBriefs(
  primary: SpotVisualBrief | null,
  secondary: SpotVisualBrief | null,
): SpotVisualBrief | null {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const keyElements = [...primary.keyElements];
  for (const item of secondary.keyElements) {
    if (!keyElements.includes(item) && keyElements.length < 6) keyElements.push(item);
  }

  const avoidElements = [...primary.avoidElements];
  for (const item of secondary.avoidElements) {
    if (!avoidElements.includes(item) && avoidElements.length < 6) avoidElements.push(item);
  }

  return {
    subject: primary.subject || secondary.subject,
    keyElements,
    atmosphere: primary.atmosphere || secondary.atmosphere,
    composition: primary.composition || secondary.composition,
    avoidElements,
  };
}

async function fetchWikipediaIntro(input: SpotVisualBriefInput): Promise<string | null> {
  const spotName = input.name.trim();
  const municipality = input.municipality.trim();
  const titles = [spotName, `${spotName} (${municipality})`, `${spotName}（${municipality}）`];

  const url = new URL("https://ja.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(WIKI_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      query?: { pages?: Record<string, { missing?: string; extract?: string; title?: string }> };
    };
    const pages = Object.values(data.query?.pages ?? {}).filter(
      (p) => !p.missing && p.extract?.trim(),
    );
    if (pages.length === 0) return null;

    const page = pages.find((p) => p.extract?.trim());
    if (!page?.extract) return null;

    const extract = sanitizeBriefItem(page.extract, 800);
    return extract || null;
  } catch {
    return null;
  }
}

function buildVisualBriefPrompt(
  input: SpotVisualBriefInput,
  wikipediaIntro: string | null,
): string {
  const addressLine = input.address?.trim() ? `\n【住所】${input.address.trim()}` : "";
  const wikiBlock = wikipediaIntro
    ? `\n【Wikipedia 概要（参考・視覚的特徴の抽出に使う）】\n${wikipediaIntro}`
    : "";

  return `【スポット名】${input.name.trim()}
【都道府県】${input.prefecture.trim()}
【市区町村】${input.municipality.trim()}${addressLine}${wikiBlock}

このスポットのイラスト用ビジュアル要素を JSON で返してください。スポット名「${input.name.trim()}」に一致する情報のみ。`;
}

async function runVisualBriefAgent(prompt: string): Promise<SpotVisualBrief | null> {
  const runner = new InMemoryRunner({ agent: spotVisualBriefAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId: "admin",
  });

  let final = "";
  for await (const event of runner.runAsync({
    userId: "admin",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }
  if (!final) return null;

  try {
    const parsed = visualBriefSchema.safeParse(JSON.parse(final));
    return parsed.success ? normalizeBrief(parsed.data) : null;
  } catch {
    return null;
  }
}

export function isSpotImageResearchEnabled(): boolean {
  const flag = process.env.SPOT_IMAGE_RESEARCH?.trim().toLowerCase();
  return flag !== "0" && flag !== "false";
}

/** 調査結果をプロンプト用テキストに整形する。 */
export function formatVisualBriefForPrompt(
  brief: SpotVisualBrief | null,
  wikipediaIntro: string | null = null,
): string {
  const lines: string[] = [];

  if (brief) {
    lines.push("【調査結果（描く内容・厳守）】");
    if (brief.subject) lines.push(`主役: ${brief.subject}`);
    if (brief.keyElements.length > 0) {
      lines.push(`必須要素: ${brief.keyElements.join("、")}`);
    }
    if (brief.atmosphere) lines.push(`雰囲気: ${brief.atmosphere}`);
    if (brief.composition) lines.push(`構図: ${brief.composition}`);
    if (brief.avoidElements.length > 0) {
      lines.push(`禁止（絶対に描かない）: ${brief.avoidElements.join("、")}`);
    }
    if (wikipediaIntro) {
      lines.push("【事実参考（Wikipedia）】");
      lines.push(wikipediaIntro.slice(0, 400));
    }
  } else if (wikipediaIntro) {
    lines.push("【事実参考（Wikipedia）】");
    lines.push(wikipediaIntro.slice(0, 500));
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

/** Google 検索 + Wikipedia でスポットの視覚要素を調査する（画像生成前）。 */
export async function researchSpotVisualBrief(
  input: SpotVisualBriefInput,
): Promise<SpotVisualBriefContext> {
  const wikipediaIntro = await fetchWikipediaIntro(input);
  if (wikipediaIntro) {
    console.info(
      `[spot-image] wikipedia intro for "${input.name.trim()}": ${wikipediaIntro.slice(0, 80)}…`,
    );
  }

  if (!isSpotImageResearchEnabled()) {
    console.info(`[spot-image] visual brief skipped (SPOT_IMAGE_RESEARCH=0)`);
    return { brief: null, wikipediaIntro };
  }

  console.info(`[spot-image] visual brief research for "${input.name.trim()}"`);
  try {
    const agentBrief = await Promise.race([
      runVisualBriefAgent(buildVisualBriefPrompt(input, wikipediaIntro)),
      new Promise<null>((_, reject) => {
        setTimeout(
          () =>
            reject(new Error(`visual brief agent timeout (${VISUAL_BRIEF_TIMEOUT_MS / 1000}s)`)),
          VISUAL_BRIEF_TIMEOUT_MS,
        );
      }),
    ]);

    const brief = mergeBriefs(agentBrief, null);
    if (!brief && !wikipediaIntro) {
      console.warn(`[spot-image] visual brief empty for "${input.name.trim()}"`);
      return { brief: null, wikipediaIntro: null };
    }

    if (brief) {
      console.info(
        `[spot-image] visual brief for "${input.name.trim()}": subject="${brief.subject}" elements=${brief.keyElements.length}`,
      );
    }

    return { brief, wikipediaIntro };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[spot-image] visual brief failed for "${input.name.trim()}": ${message}`);
    return { brief: null, wikipediaIntro };
  }
}

import { GOOGLE_SEARCH, InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import sharp from "sharp";
import { z } from "zod";
import { CHAT_MODEL } from "../modelConfig.js";

export type SpotPhotoSearchInput = {
  name: string;
  prefecture: string;
  municipality: string;
  address?: string;
};

export type ReferencePhoto = {
  sourceUrl: string;
  buffer: Buffer;
  mimeType: string;
};

const photoSearchSchema = z.object({
  pageUrls: z.array(z.string().url()).max(5).default([]),
  imageUrls: z.array(z.string().url()).max(5).default([]),
});

const FETCH_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 8_000;
const USER_AGENT = "TabiplaSpotImageBot/1.0";

const spotPhotoSearchAgent = new LlmAgent({
  name: "spot_photo_search_agent",
  model: CHAT_MODEL,
  description: "観光スポットの参考写真URLをGoogle検索で探す",
  instruction: `指定された観光スポットについて、Google検索で参考写真の URL を探し JSON を返します。

【手順】
1. google_search で次のようなクエリを試す:
   - 「{都道府県}{市区町村} {スポット名}」
   - 「{スポット名} {市区町村} 公式」
   - 「{スポット名} site:wikimedia.org」
   - 「{スポット名} {市区町村} 写真」
2. 指定市区町村・都道府県内の同一スポットの写真だけを選ぶ
3. imageUrls: 直接アクセスできる写真 URL（Wikimedia Commons、公式サイトの jpg/png/webp など）
4. pageUrls: 上記が見つからない場合の Web ページ URL（公式・観光協会・Wikipedia 記事など）

【自治体スコープ（最重要）】
- {都道府県}{市区町村} 内のスポットのみ。他地域の同名スポットは除外
- 「小諸市」「{都道府県}」だけの汎用画像、別スポットの写真、地図サムネイルは使わない

【出力】
{"imageUrls":["https://..."],"pageUrls":["https://..."]}
URL は検索結果で確認できたものだけ。捏造しない。`,
  outputSchema: photoSearchSchema,
  tools: [GOOGLE_SEARCH],
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 1024,
  },
});

function buildPhotoSearchPrompt(input: SpotPhotoSearchInput): string {
  const addressLine = input.address?.trim() ? `\n【住所】${input.address.trim()}` : "";
  return `【スポット名】${input.name.trim()}
【都道府県】${input.prefecture.trim()}
【市区町村】${input.municipality.trim()}${addressLine}

このスポット固有の参考写真 URL を JSON で返してください。スポット名「${input.name.trim()}」に一致する写真のみ。市区町村や県の汎用画像は含めないでください。`;
}

const PHOTO_SEARCH_AGENT_TIMEOUT_MS = 45_000;
/** Wikipedia 完全一致など、このスコア以上なら Google 検索エージェントを省略する。 */
const WIKI_FAST_PATH_MIN_SCORE = 90;

async function runPhotoSearchAgent(
  prompt: string,
): Promise<{ pageUrls: string[]; imageUrls: string[] }> {
  const runner = new InMemoryRunner({ agent: spotPhotoSearchAgent });
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
  if (!final) return { pageUrls: [], imageUrls: [] };

  try {
    const parsed = photoSearchSchema.safeParse(JSON.parse(final));
    return parsed.success
      ? { pageUrls: parsed.data.pageUrls, imageUrls: parsed.data.imageUrls }
      : { pageUrls: [], imageUrls: [] };
  } catch {
    return { pageUrls: [], imageUrls: [] };
  }
}

async function runPhotoSearchAgentWithTimeout(
  prompt: string,
): Promise<{ pageUrls: string[]; imageUrls: string[] }> {
  try {
    return await Promise.race([
      runPhotoSearchAgent(prompt),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Google 検索エージェントが ${PHOTO_SEARCH_AGENT_TIMEOUT_MS / 1000}s 以内に完了しませんでした`,
              ),
            ),
          PHOTO_SEARCH_AGENT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[spot-image] photo search agent skipped: ${message}`);
    return { pageUrls: [], imageUrls: [] };
  }
}

type WikiPage = {
  title?: string;
  missing?: string;
  original?: { source?: string };
  thumbnail?: { source?: string };
};

function normalizeMatchText(value: string): string {
  return value.replace(/[\s　（）()]/g, "").toLowerCase();
}

function isGenericLocationTitle(title: string, municipality: string, prefecture: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (t === municipality || t === prefecture) return true;
  if (t === `${prefecture}${municipality}`) return true;
  // 市区町村名だけ（「小諸市」記事など）
  if (t === `${municipality.replace(/市$/, "")}市`) return true;
  return false;
}

function scoreWikiTitle(title: string, spotName: string, input: SpotPhotoSearchInput): number {
  if (isGenericLocationTitle(title, input.municipality.trim(), input.prefecture.trim())) {
    return -100;
  }

  const normTitle = normalizeMatchText(title);
  const normSpot = normalizeMatchText(spotName);
  if (!normSpot) return -100;

  if (normTitle === normSpot) return 100;
  if (normTitle.includes(normSpot) || normSpot.includes(normTitle)) return 85;

  // スポット名の主要語がタイトルに含まれるか（4文字以上）
  const tokens = spotName
    .replace(/[（）()]/g, " ")
    .split(/[\s　・]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  for (const token of tokens) {
    const normToken = normalizeMatchText(token);
    if (normToken.length >= 3 && normTitle.includes(normToken)) return 70;
  }

  return 0;
}

function wikiImageUrl(page: WikiPage): string | null {
  const src = page.original?.source ?? page.thumbnail?.source;
  return src && /^https?:\/\//i.test(src) ? src : null;
}

async function fetchWikiPagesByTitles(titles: string[]): Promise<WikiPage[]> {
  if (titles.length === 0) return [];

  const url = new URL("https://ja.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original|thumbnail");
  url.searchParams.set("pithumbsize", "1200");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
    return Object.values(data.query?.pages ?? {}).filter((p) => !p.missing);
  } catch {
    return [];
  }
}

async function searchWikiPages(query: string): Promise<WikiPage[]> {
  const url = new URL("https://ja.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original|thumbnail");
  url.searchParams.set("pithumbsize", "1200");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
    return Object.values(data.query?.pages ?? {});
  } catch {
    return [];
  }
}

type ScoredUrl = { url: string; score: number; source: string };

/** Wikipedia からスポット名に一致する写真 URL を優先度付きで集める。 */
async function collectWikimediaPhotoUrls(input: SpotPhotoSearchInput): Promise<ScoredUrl[]> {
  const spotName = input.name.trim();
  const municipality = input.municipality.trim();
  const prefecture = input.prefecture.trim();
  const results: ScoredUrl[] = [];
  const seen = new Set<string>();

  const push = (url: string | null | undefined, score: number, source: string) => {
    if (!url || seen.has(url) || score < 50) return;
    seen.add(url);
    results.push({ url, score, source });
  };

  const exactTitles = [spotName, `${spotName} (${municipality})`, `${spotName}（${municipality}）`];
  const exactPages = await fetchWikiPagesByTitles(exactTitles);
  for (const page of exactPages) {
    const title = page.title ?? spotName;
    push(wikiImageUrl(page), 100, `wikipedia-exact:${title}`);
  }

  const searchQueries = [
    `${spotName} ${municipality}`,
    `${spotName} ${prefecture} ${municipality}`,
    ...(input.address?.trim() ? [`${spotName} ${input.address.trim()}`] : []),
    spotName,
  ];

  for (const q of searchQueries) {
    const pages = await searchWikiPages(q);
    const scored = pages
      .map((page) => ({
        page,
        score: scoreWikiTitle(page.title ?? "", spotName, input),
      }))
      .filter(({ score }) => score >= 50)
      .sort((a, b) => b.score - a.score);

    for (const { page, score } of scored) {
      push(wikiImageUrl(page), score, `wikipedia-search:${page.title ?? q}`);
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** SNS 共有用・ロゴなど、スポット固有でない画像 URL を除外する。 */
function isGenericImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (
    /(?:^|[/\\])(?:share|ogp|logo|icon|favicon|banner|noimage|placeholder|default|sns|social|sprite|spacer|pixel|avatar|emoji)(?:[._-]|\.)/.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\/files\/user\/share\./.test(lower)) return true;
  if (/(?:^|[/])share\.(?:png|jpe?g|webp|gif)(?:\?|$)/.test(lower)) return true;
  if (/(?:^|[/])ogp\.(?:png|jpe?g|webp)(?:\?|$)/.test(lower)) return true;
  return false;
}

function spotNameTokens(spotName: string): string[] {
  return spotName
    .replace(/[（）()]/g, " ")
    .split(/[\s　・]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ページ本文が指定スポット・市区町村に関する内容かをざっくり判定する。 */
function pageMatchesSpot(html: string, input: SpotPhotoSearchInput): boolean {
  const municipality = input.municipality.trim();
  const spotName = input.name.trim();
  const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? "";
  const bodyText = html.replace(/<[^>]+>/g, " ");
  const headSample = decodeHtmlEntities(`${title} ${bodyText.slice(0, 12_000)}`);
  const fullSample = decodeHtmlEntities(`${title} ${bodyText.slice(0, 80_000)}`);

  const municipalityStem = municipality.replace(/[市区町村]$/, "");
  const mentionsMunicipality = (text: string) =>
    text.includes(municipality) ||
    (municipalityStem.length >= 2 && text.includes(municipalityStem));

  const spotTokens = spotNameTokens(spotName).filter((t) => t.length >= 3);
  const mentionsSpotInHead =
    headSample.includes(spotName) || spotTokens.some((token) => headSample.includes(token));

  if (mentionsSpotInHead) {
    return mentionsMunicipality(fullSample);
  }

  if (!mentionsMunicipality(headSample)) return false;

  return headSample.includes(spotName) || spotTokens.some((token) => headSample.includes(token));
}

function looksLikePhotoUrl(url: string): boolean {
  if (/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(url)) return true;
  return /\/(?:wp-content|uploads?|files|images?|photo|gallery|media|assets)\//i.test(url);
}

function parseImgTags(html: string): Array<{ src: string; alt: string }> {
  const results: Array<{ src: string; alt: string }> = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = tag.match(/(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    results.push({ src, alt });
  }
  return results;
}

function resolveAbsoluteUrl(baseUrl: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractPageImageCandidates(
  html: string,
  pageUrl: string,
  input: SpotPhotoSearchInput,
): ScoredUrl[] {
  const spotName = input.name.trim();
  const results: ScoredUrl[] = [];
  const seen = new Set<string>();

  const push = (rawUrl: string | null | undefined, score: number, source: string) => {
    const absolute = rawUrl ? resolveAbsoluteUrl(pageUrl, rawUrl) : null;
    if (!absolute || seen.has(absolute) || isGenericImageUrl(absolute)) return;
    if (!looksLikePhotoUrl(absolute)) return;
    seen.add(absolute);
    results.push({ url: absolute, score, source });
  };

  const ogPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const pattern of ogPatterns) {
    const match = html.match(pattern);
    push(match?.[1], 82, `og-image:${pageUrl}`);
  }

  for (const { src, alt } of parseImgTags(html)) {
    let score = 78;
    if (alt.includes(spotName) || spotNameTokens(spotName).some((t) => alt.includes(t))) {
      score = 88;
    } else if (/upload|photo|gallery|media/i.test(src)) {
      score = 80;
    }
    push(src, score, `page-image:${pageUrl}`);
  }

  return results;
}

async function collectImagesFromPage(
  pageUrl: string,
  input: SpotPhotoSearchInput,
): Promise<ScoredUrl[]> {
  const html = await fetchPageHtml(pageUrl);
  if (!html) return [];
  if (!pageMatchesSpot(html, input)) {
    console.info(`[spot-image] page rejected (scope mismatch): ${pageUrl}`);
    return [];
  }
  return extractPageImageCandidates(html, pageUrl, input);
}

async function searchDuckDuckGoPages(query: string, max = 5): Promise<string[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const urls: string[] = [];
    for (const match of html.matchAll(/uddg=([^&"']+)/g)) {
      if (urls.length >= max) break;
      try {
        urls.push(decodeURIComponent(match[1] ?? ""));
      } catch {
        // skip malformed url
      }
    }
    return urls;
  } catch {
    return [];
  }
}

/** LLM を使わず Web 検索 → ページ関連性チェック → 画像抽出。 */
async function collectWebDiscoveryCandidates(input: SpotPhotoSearchInput): Promise<ScoredUrl[]> {
  const queries = [
    `${input.name} ${input.municipality} ${input.prefecture}`,
    `${input.name} ${input.municipality} 公式`,
    `${input.name} ${input.prefecture}`,
  ];

  const pageUrls = new Set<string>();
  for (const query of queries) {
    for (const url of await searchDuckDuckGoPages(query, 5)) {
      pageUrls.add(url);
    }
    if (pageUrls.size >= 8) break;
  }

  if (pageUrls.size === 0) {
    console.info(`[spot-image] web discovery pages for "${input.name}": 0 (search unavailable)`);
    return [];
  }

  console.info(`[spot-image] web discovery pages for "${input.name}": ${pageUrls.size}`);

  const results: ScoredUrl[] = [];
  for (const pageUrl of pageUrls) {
    results.push(...(await collectImagesFromPage(pageUrl, input)));
  }
  return results.sort((a, b) => b.score - a.score);
}

function normalizeImageMime(contentType: string | null, url: string): string | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  if (type && /^image\/(jpeg|jpg|png|webp)$/.test(type)) {
    return type === "image/jpg" ? "image/jpeg" : type;
  }
  if (/\.(jpe?g)(\?|$)/i.test(url)) return "image/jpeg";
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return null;
}

async function downloadImage(url: string): Promise<ReferencePhoto | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const mimeType = normalizeImageMime(res.headers.get("content-type"), url);
    if (!mimeType) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < MIN_IMAGE_BYTES || arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return null;
    }

    const buffer = await sharp(Buffer.from(arrayBuffer))
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    return { sourceUrl: url, buffer, mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

function mergeCandidateUrls(
  candidates: ScoredUrl[],
  seen: Set<string>,
  url: string | null | undefined,
  score: number,
  source: string,
): void {
  const trimmed = url?.trim();
  if (!trimmed || seen.has(trimmed) || isGenericImageUrl(trimmed)) return;
  seen.add(trimmed);
  candidates.push({ url: trimmed, score, source });
}

async function collectGoogleSearchCandidates(input: SpotPhotoSearchInput): Promise<ScoredUrl[]> {
  console.info(`[spot-image] google search fallback for "${input.name}"`);
  const { pageUrls, imageUrls } = await runPhotoSearchAgentWithTimeout(
    buildPhotoSearchPrompt(input),
  );
  console.info(
    `[spot-image] google search result for "${input.name}": imageUrls=${imageUrls.length} pageUrls=${pageUrls.length}`,
  );

  const results: ScoredUrl[] = [];

  for (const imageUrl of imageUrls) {
    if (isGenericImageUrl(imageUrl)) continue;
    results.push({ url: imageUrl, score: 90, source: "google-search-image" });
  }
  for (const pageUrl of pageUrls) {
    results.push(...(await collectImagesFromPage(pageUrl, input)));
  }

  return results;
}

/** ネット検索で参考写真を取得する。 */
export async function findReferencePhoto(input: SpotPhotoSearchInput): Promise<ReferencePhoto> {
  const wikiCandidates = await collectWikimediaPhotoUrls(input);
  console.info(
    `[spot-image] wikipedia candidates for "${input.name}": ${wikiCandidates.length} (${wikiCandidates
      .slice(0, 3)
      .map((c) => `${c.source}=${c.score}`)
      .join(", ")})`,
  );

  for (const candidate of wikiCandidates) {
    const photo = await downloadImage(candidate.url);
    if (photo && candidate.score >= WIKI_FAST_PATH_MIN_SCORE) {
      console.info(
        `[spot-image] reference photo: ${photo.sourceUrl} (${candidate.source}, score=${candidate.score}, fast-path)`,
      );
      return photo;
    }
  }

  const seen = new Set<string>();
  const candidates: ScoredUrl[] = [];
  for (const item of wikiCandidates) {
    mergeCandidateUrls(candidates, seen, item.url, item.score, item.source);
  }

  const needsGoogleFallback =
    wikiCandidates.length === 0 || (wikiCandidates[0]?.score ?? 0) < WIKI_FAST_PATH_MIN_SCORE;
  if (needsGoogleFallback) {
    for (const item of await collectWebDiscoveryCandidates(input)) {
      mergeCandidateUrls(candidates, seen, item.url, item.score, item.source);
    }

    const hasStrongCandidate = candidates.some((c) => c.score >= 85);
    if (!hasStrongCandidate) {
      for (const item of await collectGoogleSearchCandidates(input)) {
        mergeCandidateUrls(candidates, seen, item.url, item.score, item.source);
      }
    } else {
      console.info(`[spot-image] skipping google search agent (web discovery score>=85)`);
    }
  } else {
    console.info(
      `[spot-image] skipping google search fallback (wikipedia score=${wikiCandidates[0]?.score})`,
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  console.info(
    `[spot-image] photo candidates for "${input.name}": ${candidates.length} (${candidates
      .slice(0, 3)
      .map((c) => `${c.source}=${c.score}`)
      .join(", ")})`,
  );

  for (const candidate of candidates) {
    const photo = await downloadImage(candidate.url);
    if (photo) {
      console.info(
        `[spot-image] reference photo: ${photo.sourceUrl} (${candidate.source}, score=${candidate.score})`,
      );
      return photo;
    }
  }

  throw new Error(
    `「${input.name}」（${input.prefecture}${input.municipality}）の参考写真がネット上で見つかりませんでした。写真をアップロードしてください。`,
  );
}

/** 参考写真が見つからない場合は null を返す（auto モード用）。 */
export async function tryFindReferencePhoto(
  input: SpotPhotoSearchInput,
): Promise<ReferencePhoto | null> {
  try {
    return await findReferencePhoto(input);
  } catch {
    return null;
  }
}

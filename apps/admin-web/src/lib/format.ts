import { getFixedPrefecture, getMunicipality } from "../master/index.ts";
import { extractAreaFromAddress } from "./address.ts";
import { formatCategories } from "./categories.ts";

export const MAX_SPOT_DESCRIPTION_LENGTH = 200;
export const MAX_SPOT_HIGHLIGHT_LENGTH = 30;
export const MAX_SPOT_HIGHLIGHT_COUNT = 3;

export function trimSpotDescription(text: string): string {
  return text.trim().slice(0, MAX_SPOT_DESCRIPTION_LENGTH);
}

/** おすすめポイント1件を正規化（空白除去・30字上限）。 */
export function trimSpotHighlight(text: string): string {
  return text.trim().slice(0, MAX_SPOT_HIGHLIGHT_LENGTH);
}

/** おすすめポイント配列を正規化（最大3件・各30字）。 */
export function normalizeHighlights(items: string[]): string[] {
  return items.map(trimSpotHighlight).filter(Boolean).slice(0, MAX_SPOT_HIGHLIGHT_COUNT);
}

/** テキストエリア入力中のおすすめポイントを行数・文字数上限内に収める。 */
export function enforceHighlightsText(text: string): string {
  return text
    .split("\n")
    .slice(0, MAX_SPOT_HIGHLIGHT_COUNT)
    .map((line) => line.slice(0, MAX_SPOT_HIGHLIGHT_LENGTH))
    .join("\n");
}

/** テキストエリアの文字列を正規化して返す（保存・表示用）。 */
export function parseHighlightsText(text: string): string[] {
  return normalizeHighlights(text.split("\n"));
}

/** 正規化済み配列をテキストエリア用の文字列へ。 */
export function formatHighlightsText(items: string[]): string {
  return normalizeHighlights(items).join("\n");
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** おすすめポイント配列を CSV 用のセミコロン区切り文字列へ。 */
export function formatHighlights(value?: string[]): string {
  if (!value?.length) return "";
  return normalizeHighlights(value).join(";");
}

/** CSV のセミコロン区切り文字列をおすすめポイント配列へ。 */
export function parseHighlights(value: string): string[] {
  return normalizeHighlights(value.split(";"));
}

export function spotToCsvRow(spot: {
  name: string;
  description: string;
  highlights?: string[];
  category?: string | string[];
  area?: string;
  prefecture?: string;
  address?: string;
}): string {
  const quoteCsvField = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const prefecture = spot.prefecture ?? getFixedPrefecture();
  const area =
    spot.area ?? (spot.address ? extractAreaFromAddress(spot.address, getFixedPrefecture()) : "");
  return [
    spot.name,
    formatCategories(spot.category),
    area,
    prefecture,
    spot.address ?? "",
    spot.description,
    formatHighlights(spot.highlights),
  ]
    .map((v) => quoteCsvField(String(v)))
    .join(",");
}

export const CSV_HEADER = "name,category,area,prefecture,address,description,highlights";

/** 一括取り込み用 CSV テンプレート（ヘッダー + サンプル1行）。 */
export function buildCsvTemplate(prefecture: string = getFixedPrefecture()): string {
  const municipality = getMunicipality();
  return [
    CSV_HEADER,
    `"道の駅 〇〇","ショッピング;食","${municipality.defaultArea}","${prefecture}","${prefecture}${municipality.defaultArea}国道沿い1","地元の特産品や食堂が楽しめる道の駅。旅の休憩・お土産選びに便利です。","地元野菜の直売所が充実している;名物メニューの食堂が人気;展望デッキの景色がきれい"`,
  ].join("\n");
}

/** CSV テンプレートを spots-template.csv としてダウンロードする。 */
export function downloadCsvTemplate(prefecture: string = getFixedPrefecture()): void {
  const content = `\uFEFF${buildCsvTemplate(prefecture)}\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "spots-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

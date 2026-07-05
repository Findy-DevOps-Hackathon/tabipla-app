import { getFixedPrefecture } from "../master/index.ts";
import { extractAreaFromAddress } from "./address.ts";
import { formatCategories } from "./categories.ts";

export const MAX_SPOT_DESCRIPTION_LENGTH = 200;
const HIGHLIGHT_MAX = 80;
const HIGHLIGHT_COUNT = 3;

export function trimSpotDescription(text: string): string {
  return text.trim().slice(0, MAX_SPOT_DESCRIPTION_LENGTH);
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
  return value
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, HIGHLIGHT_COUNT)
    .join(";");
}

/** CSV のセミコロン区切り文字列をおすすめポイント配列へ。 */
export function parseHighlights(value: string): string[] {
  return value
    .split(";")
    .map((s) => s.trim().slice(0, HIGHLIGHT_MAX))
    .filter(Boolean)
    .slice(0, HIGHLIGHT_COUNT);
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
  return [
    CSV_HEADER,
    `"懐古園","歴史・文化;自然","小諸市","${prefecture}","長野県小諸市中央1丁目","小諸城址の公園。紅葉の名所として知られ、春には桜、秋には紅葉が楽しめます。","小諸城址と三の門が見どころ;秋の紅葉シーズンは特に人気;千曲川を望む展望スポットあり"`,
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

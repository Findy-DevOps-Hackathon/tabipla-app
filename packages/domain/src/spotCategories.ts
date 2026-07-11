export const MAX_SPOT_CATEGORIES = 3;

/** 観光地カテゴリのマスタ（管理画面・agent・CSV で共通）。 */
export const SPOT_CATEGORIES = [
  "自然",
  "歴史・文化",
  "都市",
  "芸術",
  "食",
  "レジャー・スポーツ",
  "イベント",
  "ショッピング",
] as const;

export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

export function isSpotCategory(value: string): value is SpotCategory {
  return (SPOT_CATEGORIES as readonly string[]).includes(value);
}

/** API の category（単一 or 配列）をフォーム用配列へ正規化する。 */
export function normalizeCategories(value?: string | string[]): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SPOT_CATEGORIES);
}

/** カテゴリ配列を CSV 用のセミコロン区切り文字列へ。 */
export function formatCategories(value?: string | string[]): string {
  return normalizeCategories(value).join(";");
}

/** CSV 等のセミコロン区切り文字列を配列へ。 */
export function parseCategories(value: string): string[] {
  return normalizeCategories(value.split(";"));
}

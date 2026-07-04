export const MAX_SPOT_CATEGORIES = 3;

/** 観光地カテゴリのマスタ（管理画面・AI登録・CSV で共通）。 */
export const SPOT_CATEGORIES = [
  "自然",
  "歴史・文化",
  "都市",
  "芸術",
  "食",
  "産業",
  "宗教",
  "農山漁村",
  "レジャー・スポーツ",
  "イベント",
  "ウェルネス",
  "ショッピング",
] as const;

export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

const CATEGORY_STYLE_MAP: Record<SpotCategory, string> = {
  自然: "bg-green-100 text-green-800",
  "歴史・文化": "bg-amber-100 text-amber-800",
  都市: "bg-slate-100 text-slate-800",
  芸術: "bg-purple-100 text-purple-800",
  食: "bg-orange-100 text-orange-800",
  産業: "bg-stone-100 text-stone-800",
  宗教: "bg-indigo-100 text-indigo-800",
  農山漁村: "bg-lime-100 text-lime-800",
  "レジャー・スポーツ": "bg-sky-100 text-sky-800",
  イベント: "bg-pink-100 text-pink-800",
  ウェルネス: "bg-teal-100 text-teal-800",
  ショッピング: "bg-rose-100 text-rose-800",
};

export function isSpotCategory(value: string): value is SpotCategory {
  return (SPOT_CATEGORIES as readonly string[]).includes(value);
}

export function getCategoryStyle(category: string): string {
  return isSpotCategory(category)
    ? CATEGORY_STYLE_MAP[category]
    : "border border-[#e2e8f0] bg-[#f1f6fb] text-[#475569]";
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

/** 既存カテゴリに1件追加（最大3件・重複なし）。 */
export function addCategory(existing: string[], incoming: string): string[] {
  const trimmed = incoming.trim();
  if (!trimmed || existing.includes(trimmed) || existing.length >= MAX_SPOT_CATEGORIES) {
    return existing;
  }
  return [...existing, trimmed];
}

/** CSV 等のセミコロン区切り文字列を配列へ。 */
export function parseCategories(value: string): string[] {
  return normalizeCategories(value.split(";"));
}

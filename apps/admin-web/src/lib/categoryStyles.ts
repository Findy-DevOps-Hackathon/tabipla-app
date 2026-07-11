import {
  formatCategories,
  isSpotCategory,
  MAX_SPOT_CATEGORIES,
  normalizeCategories,
  parseCategories,
  SPOT_CATEGORIES,
  type SpotCategory,
} from "@tabipla/domain";

export {
  formatCategories,
  isSpotCategory,
  MAX_SPOT_CATEGORIES,
  normalizeCategories,
  parseCategories,
  SPOT_CATEGORIES,
  type SpotCategory,
};

const CATEGORY_STYLE_MAP: Record<SpotCategory, string> = {
  自然: "bg-green-100 text-green-800",
  "歴史・文化": "bg-amber-100 text-amber-800",
  都市: "bg-slate-100 text-slate-800",
  芸術: "bg-purple-100 text-purple-800",
  食: "bg-orange-100 text-orange-800",
  "レジャー・スポーツ": "bg-sky-100 text-sky-800",
  イベント: "bg-pink-100 text-pink-800",
  ショッピング: "bg-rose-100 text-rose-800",
};

export function getCategoryStyle(category: string): string {
  return isSpotCategory(category)
    ? CATEGORY_STYLE_MAP[category]
    : "border border-[#e2e8f0] bg-[#f1f6fb] text-[#475569]";
}

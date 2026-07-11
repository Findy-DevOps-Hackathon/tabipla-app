import type { SpotCategory } from "../data/spots.ts";

/**
 * 写真オーバーレイ上のカテゴリバッジ（白文字・半透明背景）。
 */
const CATEGORY_OVERLAY_BADGE: Record<string, string> = {
  歴史: "bg-blue-600/90",
  自然: "bg-teal-600/90",
  食: "bg-amber-600/90",
  グルメ: "bg-amber-600/90",
  観光: "bg-slate-600/90",
  "歴史・文化": "bg-blue-600/90",
  ショッピング: "bg-rose-600/90",
  都市: "bg-slate-600/90",
  芸術: "bg-purple-600/90",
  "レジャー・スポーツ": "bg-sky-600/90",
};

const CATEGORY_OVERLAY_BADGE_DEFAULT = "bg-slate-600/90";

export function categoryOverlayBadgeClass(category: SpotCategory | string): string {
  return CATEGORY_OVERLAY_BADGE[category] ?? CATEGORY_OVERLAY_BADGE_DEFAULT;
}

import type { SpotCategory } from "../data/spots.ts";

/**
 * カテゴリバッジの配色（背景 + 文字）。
 * デザインブリーフ（docs/figma-user-design-brief.md §2.2）と一致させる。
 * 定義のないカテゴリは「その他」（slate）にフォールバックする。
 */
const CATEGORY_BADGE: Record<string, string> = {
  観光: "bg-[#ffe4e6] text-[#be123c]",
  食: "bg-[#fef3c7] text-[#b45309]",
  グルメ: "bg-[#fef3c7] text-[#b45309]",
  自然: "bg-[#d1fae5] text-[#047857]",
  歴史: "bg-[#fef3c7] text-[#b45309]",
  "歴史・文化": "bg-[#fef3c7] text-[#b45309]",
  ショッピング: "bg-[#ffe4e6] text-[#be123c]",
  都市: "bg-[#f1f5f9] text-[#475569]",
  芸術: "bg-[#ede9fe] text-[#6d28d9]",
  "レジャー・スポーツ": "bg-[#e0f2fe] text-[#0369a1]",
};

const CATEGORY_BADGE_DEFAULT = "bg-[#f1f5f9] text-[#475569]";

/** 写真オーバーレイ上のカテゴリバッジ（白文字・半透明背景）。 */
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

export function categoryBadgeClass(category: SpotCategory | string): string {
  return CATEGORY_BADGE[category] ?? CATEGORY_BADGE_DEFAULT;
}

export function categoryOverlayBadgeClass(category: SpotCategory | string): string {
  return CATEGORY_OVERLAY_BADGE[category] ?? CATEGORY_OVERLAY_BADGE_DEFAULT;
}

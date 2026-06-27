import type { SpotCategory } from "../data/spots.ts";

/**
 * カテゴリバッジの配色（背景 + 文字）。
 * デザインブリーフ（docs/figma-user-design-brief.md §2.2）と一致させる。
 * 定義のないカテゴリは「その他」（slate）にフォールバックする。
 */
const CATEGORY_BADGE: Record<string, string> = {
  観光: "bg-[#ffe4e6] text-[#be123c]",
  グルメ: "bg-[#fef3c7] text-[#b45309]",
  宿泊: "bg-[#ede9fe] text-[#6d28d9]",
  自然: "bg-[#d1fae5] text-[#047857]",
  歴史: "bg-[#fef3c7] text-[#b45309]",
};

const CATEGORY_BADGE_DEFAULT = "bg-[#f1f5f9] text-[#475569]";

export function categoryBadgeClass(category: SpotCategory | string): string {
  return CATEGORY_BADGE[category] ?? CATEGORY_BADGE_DEFAULT;
}

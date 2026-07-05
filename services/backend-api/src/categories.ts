/** 観光地カテゴリのマスタ（管理画面・agent と同期）。 */
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

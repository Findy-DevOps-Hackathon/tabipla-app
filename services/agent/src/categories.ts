/** 観光地カテゴリのマスタ（管理画面と同期）。 */
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

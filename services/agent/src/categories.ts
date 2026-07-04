/** 観光地カテゴリのマスタ（管理画面と同期）。 */
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

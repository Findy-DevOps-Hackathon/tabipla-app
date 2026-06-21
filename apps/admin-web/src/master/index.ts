/**
 * 自治体・都道府県マスタ。
 *
 * 管理画面はログイン自治体に紐づき、都道府県はマスタから固定される。
 * 実運用では API / DB から取得する想定（現状はデモ: 小諸市）。
 */

/** 都道府県マスタ（当該自治体が属する都道府県のみ有効） */
export const PREFECTURES = ["長野県"] as const;

export type Prefecture = (typeof PREFECTURES)[number];

/** ログイン中自治体 */
export const MUNICIPALITY = {
  name: "小諸市",
  prefecture: "長野県" satisfies Prefecture,
  defaultArea: "小諸市",
} as const;

export function isValidPrefecture(value: string): value is Prefecture {
  return (PREFECTURES as readonly string[]).includes(value);
}

/** スポット保存時に使う固定都道府県 */
export function getFixedPrefecture(): Prefecture {
  return MUNICIPALITY.prefecture;
}

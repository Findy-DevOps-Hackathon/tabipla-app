/**
 * スワイプ型レコメンド体験の型定義と定数。
 *
 * スポットデータは comparisonSpots.ts（seed-data 由来）および API から取得する。
 */

export type SpotCategory = "観光" | "グルメ" | "自然" | "歴史";

/** 好み診断の比較カード専用。DB カテゴリ（都市・芸術・レジャー）をそのまま使う。 */
export type DiagnosisSpotCategory = SpotCategory | "都市" | "芸術" | "レジャー・スポーツ";

export const SWIPE_LIMIT = 11; // 好み診断デッキのスポット数（比較回数より多めに確保）
export const COMPARISON_ROUNDS = 8; // 初回の比較回数
export const SWIPE_LIMIT_REFINE = 6; // 深掘りデッキのスポット数
export const COMPARISON_ROUNDS_REFINE = 5; // 深掘りの比較回数

export type SwipeSpot = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: DiagnosisSpotCategory;
  description: string;
  /** DB のおすすめポイント（最大3件） */
  highlights?: string[];
  /** デモデータ用の補足テキスト（highlights がない場合のフォールバック） */
  trivia?: string;
  image: string;
};

export type Recommendation = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: SpotCategory;
  description: string;
  highlights?: string[];
  image: string;
};

export const RECOMMENDATIONS_PAGE_SIZE = 10;

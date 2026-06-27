/**
 * backend-api のレスポンスに対応する型。
 *
 * search-core の `SpotDocument` / `SearchResult` に対応するが、フロントは
 * search-core（Node/ES 依存）に直接依存させず、HTTP 境界の型として最小限を再定義する。
 */
export type GeoPoint = {
  lat: number;
  lon: number;
};

export type SpotDocument = {
  id: string;
  name: string;
  description: string;
  category?: string | string[];
  area?: string;
  prefecture?: string;
  address?: string;
  tags?: string[];
  location?: GeoPoint;
  price?: number;
  createdAt?: string;
  updatedAt?: string;
};

/** 検索結果1件（スコア + ドキュメント本体）。 */
export type SearchResult = {
  id: string;
  score: number | null;
  document: SpotDocument;
};

/** `GET /search` / `POST /search/semantic` のレスポンス形。 */
export type SearchResponse = {
  count: number;
  results: SearchResult[];
  /** semantic 検索時のみ返る。 */
  mode?: "vector" | "hybrid";
};

/** フロントで選べる検索モード。 */
export type SearchMode = "keyword" | "vector" | "hybrid";

/** クーポン（バックエンド coupons テーブル対応）。 */
export type RecommendationType = "お食事処" | "お土産";

export type Coupon = {
  id: string;
  spotId: string;
  title: string;
  description?: string | null;
  discountPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type Recommendation = {
  id: string;
  spotId: string;
  type: RecommendationType;
  name: string;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  comment?: string | null;
  url?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CouponWithSpot = Coupon & { spotName: string };

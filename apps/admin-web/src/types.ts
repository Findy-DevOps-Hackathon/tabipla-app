export type GeoPoint = { lat: number; lon: number };

export type Spot = {
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

export type SpotListResponse = {
  total: number;
  count: number;
  spots: Spot[];
};

export type BulkImportResponse = {
  count: number;
  spots: Spot[];
};

export const SPOT_CATEGORIES = ["観光", "グルメ", "宿泊", "自然", "歴史"] as const;
export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

export const PAGE_SIZE = 20;

export const RECOMMENDATION_TYPES = ["お食事処", "お土産"] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export type Coupon = {
  id: string;
  spotId: string;
  title: string;
  description?: string | null;
  discountPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type CouponInput = {
  spotId: string;
  title: string;
  description?: string;
  discountPercent: number;
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

export type RecommendationInput = {
  spotId: string;
  type: RecommendationType;
  name: string;
  address?: string;
  lat?: number;
  lon?: number;
  comment?: string;
  url?: string;
};

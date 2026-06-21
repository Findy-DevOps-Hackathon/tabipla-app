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

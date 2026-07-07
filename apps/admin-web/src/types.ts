export type GeoPoint = { lat: number; lon: number };

export type Spot = {
  id: string;
  name: string;
  description: string;
  category?: string | string[];
  area?: string;
  prefecture?: string;
  address?: string;
  highlights?: string[];
  imageUrl?: string;
  location?: GeoPoint;
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

export const PAGE_SIZE = 20;

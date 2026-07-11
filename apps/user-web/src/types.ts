/**
 * backend-api のレスポンスに対応する型。
 *
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
  highlights?: string[];
  imageUrl?: string;
  location?: GeoPoint;
  createdAt?: string;
  updatedAt?: string;
};

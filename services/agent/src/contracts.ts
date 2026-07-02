// agentサービス内の共通型（旧 @tabisaki/contracts を移植）。
// 本データ結合時は @tabipla/search-core の SpotDocument 等に寄せる/変換する。

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Spot {
  id: string;
  name: string;
  category: string; // 使える値は nature / gourmet / history
  location: LatLon;
  priceLevel: number; // 0-4
  description?: string;
}

// ① 候補検索（本データは @tabipla/search-core searchCandidateSpots）
export interface SearchInput {
  query: string; // 自然文の検索意図
  center?: LatLon; // 現在地。geo_distanceの基準
  radiusKm?: number; // centerからの半径
  category?: string[]; // nature / gourmet / history（OR）
  priceLevelMax?: number; // 0-4。これ以下に絞る
  k?: number; // 取得件数（既定8）
}
export type SearchFn = (i: SearchInput) => Promise<Spot[]>;

// ② 移動時間（本データは Maps Routes / A4）
export type TravelMode = "walk" | "drive" | "transit";
export interface TravelTimesInput {
  origin: LatLon;
  destinations: { id: string; at: LatLon }[];
  mode: TravelMode;
}
export type TravelTimesFn = (
  i: TravelTimesInput,
) => Promise<{ destId: string; durationSec: number }[]>;

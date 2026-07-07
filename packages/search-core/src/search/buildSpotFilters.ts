import type { estypes } from "@elastic/elasticsearch";
import type { GeoPoint } from "../types/spot.js";

/** searchCandidateSpots 向けの構造化フィルタ。 */
export type CandidateSpotFilterParams = {
  category?: string | string[];
  /** geo_distance の中心点。 */
  near?: GeoPoint;
  /** geo_distance の半径（km）。 */
  radiusKm?: number;
};

/**
 * category / geo_distance フィルタを Elasticsearch の filter 句配列に変換する。
 */
export function buildCandidateSpotFilters(
  params: CandidateSpotFilterParams,
): estypes.QueryDslQueryContainer[] {
  const hasNear = params.near !== undefined;
  const hasRadius = params.radiusKm !== undefined;
  if (hasNear !== hasRadius) {
    throw new Error(
      "[search-core] buildCandidateSpotFilters: geo フィルタには near と radiusKm の両方が必要です。",
    );
  }
  if (params.radiusKm !== undefined && params.radiusKm <= 0) {
    throw new Error(
      "[search-core] buildCandidateSpotFilters: radiusKm は正の数である必要があります。",
    );
  }

  const filters: estypes.QueryDslQueryContainer[] = [];

  if (params.category !== undefined) {
    if (Array.isArray(params.category)) {
      filters.push({ terms: { category: params.category } });
    } else {
      filters.push({ term: { category: params.category } });
    }
  }

  if (params.near !== undefined && params.radiusKm !== undefined) {
    filters.push({
      geo_distance: {
        distance: `${params.radiusKm}km`,
        location: params.near,
      },
    });
  }

  return filters;
}

import type { estypes } from "@elastic/elasticsearch";
import type { GeoPoint } from "../types/spot.js";

/** searchCandidateSpots 向けの構造化フィルタ。 */
export type CandidateSpotFilterParams = {
  category?: string | string[];
  /** 価格下限（円、含む）。 */
  priceMin?: number;
  /** 価格上限（円、含む）。 */
  priceMax?: number;
  /** geo_distance の中心点。 */
  near?: GeoPoint;
  /** geo_distance の半径（km）。 */
  radiusKm?: number;
};

/**
 * category / price / geo_distance フィルタを Elasticsearch の filter 句配列に変換する。
 */
export function buildCandidateSpotFilters(
  params: CandidateSpotFilterParams,
): estypes.QueryDslQueryContainer[] {
  if (
    params.priceMin !== undefined &&
    params.priceMax !== undefined &&
    params.priceMin > params.priceMax
  ) {
    throw new Error(
      "[search-core] buildCandidateSpotFilters: priceMin は priceMax 以下である必要があります。",
    );
  }

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

  if (params.priceMin !== undefined || params.priceMax !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (params.priceMin !== undefined) range.gte = params.priceMin;
    if (params.priceMax !== undefined) range.lte = params.priceMax;
    filters.push({ range: { price: range } });
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

import type { estypes } from "@elastic/elasticsearch";
import type { GeoPoint } from "../types/spot.js";

/** searchCandidateSpots 向けの構造化フィルタ。 */
export type CandidateSpotFilterParams = {
  category?: string | string[];
  prefecture?: string | string[];
  area?: string | string[];
  /** 候補に含める ID。目的地カタログ内の検索などに使う。 */
  ids?: string[];
  /** 候補から除外する ID。訪問済み・Nope 済みスポットなどに使う。 */
  excludeIds?: string[];
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

  if (params.prefecture !== undefined) {
    if (Array.isArray(params.prefecture)) {
      filters.push({ terms: { prefecture: params.prefecture } });
    } else {
      filters.push({ term: { prefecture: params.prefecture } });
    }
  }

  if (params.area !== undefined) {
    if (Array.isArray(params.area)) {
      filters.push({ terms: { "area.keyword": params.area } });
    } else {
      filters.push({ term: { "area.keyword": params.area } });
    }
  }

  if (params.ids && params.ids.length > 0) {
    filters.push({ ids: { values: params.ids } });
  }

  if (params.excludeIds && params.excludeIds.length > 0) {
    filters.push({
      bool: {
        must_not: [{ ids: { values: params.excludeIds } }],
      },
    });
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

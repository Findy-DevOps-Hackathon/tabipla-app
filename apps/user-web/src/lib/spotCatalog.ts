import { fetchPublicSpots, fetchSpotById } from "../api.ts";
import { DESTINATION_AREA, DESTINATION_PREFECTURE } from "../config.ts";
import {
  documentToRecommendation,
  documentToSwipeSpot,
  planItemToRecommendation,
} from "./spotMapper.ts";
import type { Recommendation, SwipeSpot } from "../data/spots.ts";

const DEFAULT_SPOT_QUERY = {
  prefecture: DESTINATION_PREFECTURE,
  area: DESTINATION_AREA,
} as const;

/** 公開 GET /v1/spots からスワイプ用カタログを取得する（失敗時は空配列）。 */
export async function loadSwipeCatalog(limit = 30): Promise<SwipeSpot[]> {
  try {
    const docs = await fetchPublicSpots({ ...DEFAULT_SPOT_QUERY, limit });
    return docs.map(documentToSwipeSpot);
  } catch {
    return [];
  }
}

/** 探索一覧用の Recommendation 配列を GET /v1/spots から取得する。 */
export async function loadExploreSpots(limit = 30): Promise<Recommendation[]> {
  try {
    const docs = await fetchPublicSpots({ ...DEFAULT_SPOT_QUERY, limit });
    return docs.map(documentToRecommendation);
  } catch {
    return [];
  }
}

/** URL ディープリンク用：ID から Recommendation を GET /v1/spots/:id で解決する。 */
export async function resolveSpotById(
  id: string,
  recommendations: Recommendation[],
  exploreSpots: Recommendation[],
): Promise<Recommendation | null> {
  const cached =
    recommendations.find((r) => r.id === id) ?? exploreSpots.find((r) => r.id === id);
  if (cached) return cached;

  try {
    const doc = await fetchSpotById(id);
    return documentToRecommendation(doc);
  } catch {
    return null;
  }
}

export { planItemToRecommendation };

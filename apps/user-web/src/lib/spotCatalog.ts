import { fetchPublicSpots, fetchSpotById } from "../api.ts";
import {
  getCurrentDestinations,
  type TripDestination,
} from "./destination.ts";
import {
  documentToRecommendation,
  documentToSwipeSpot,
  planItemToRecommendation,
  spotImageUrl,
  SPOT_IMAGE_PLACEHOLDER,
} from "./spotMapper.ts";
import type { Recommendation, SwipeSpot } from "../data/spots.ts";
import type { SpotDocument } from "../types.ts";

export type SpotCatalogBundle = {
  docs: SpotDocument[];
  swipeSpots: SwipeSpot[];
  exploreSpots: Recommendation[];
};

/** GET /v1/spots を1回だけ呼び、スワイプ・探索・画像更新用データをまとめて返す。 */
export async function loadSpotCatalogBundle(
  limit = 30,
  destinations: TripDestination[] = getCurrentDestinations(),
): Promise<SpotCatalogBundle> {
  try {
    const docs = await fetchPublicSpots({ destinations, limit });
    const primary = destinations[0];
    return {
      docs,
      swipeSpots: docs.map((doc) => documentToSwipeSpot(doc, primary)),
      exploreSpots: docs.map((doc) => documentToRecommendation(doc, primary)),
    };
  } catch {
    return { docs: [], swipeSpots: [], exploreSpots: [] };
  }
}

/** localStorage 復元分の画像 URL を API の imageUrl で最新化する。 */
export function refreshRecommendationImages(
  items: Recommendation[],
  docs: SpotDocument[],
): Recommendation[] {
  const docById = new Map(docs.map((doc) => [doc.id, doc]));
  return items.map((rec) => {
    const doc = docById.get(rec.id);
    if (doc) {
      const url = spotImageUrl(doc);
      return url !== SPOT_IMAGE_PLACEHOLDER ? { ...rec, image: url } : rec;
    }
    return rec;
  });
}

/** 公開 GET /v1/spots からスワイプ用カタログを取得する（失敗時は空配列）。 */
export async function loadSwipeCatalog(limit = 30): Promise<SwipeSpot[]> {
  const { swipeSpots } = await loadSpotCatalogBundle(limit);
  return swipeSpots;
}

/** 探索一覧用の Recommendation 配列を GET /v1/spots から取得する。 */
export async function loadExploreSpots(limit = 30): Promise<Recommendation[]> {
  const { exploreSpots } = await loadSpotCatalogBundle(limit);
  return exploreSpots;
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

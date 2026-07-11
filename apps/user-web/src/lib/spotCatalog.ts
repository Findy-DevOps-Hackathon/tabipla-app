import { fetchPublicSpots, fetchSpotById } from "../api.ts";
import type { Recommendation } from "../data/spots.ts";
import type { SpotDocument } from "../types.ts";
import { getCurrentDestinations, type TripDestination } from "./destination.ts";
import { documentToRecommendation, planItemToRecommendation, spotImageUrl } from "./spotMapper.ts";

export type SpotCatalogBundle = {
  docs: SpotDocument[];
  exploreSpots: Recommendation[];
};

/** GET /v1/spots を1回だけ呼び、探索・画像更新用データをまとめて返す。 */
export async function loadSpotCatalogBundle(
  limit = 30,
  destinations: TripDestination[] = getCurrentDestinations(),
): Promise<SpotCatalogBundle> {
  try {
    const docs = await fetchPublicSpots({ destinations, limit });
    const primary = destinations[0];
    return {
      docs,
      exploreSpots: docs.map((doc) => documentToRecommendation(doc, primary)),
    };
  } catch {
    return { docs: [], exploreSpots: [] };
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
    return doc ? { ...rec, image: spotImageUrl(doc) } : rec;
  });
}

/** URL ディープリンク用：ID から Recommendation を GET /v1/spots/:id で解決する。 */
export async function resolveSpotById(
  id: string,
  recommendations: Recommendation[],
  exploreSpots: Recommendation[],
): Promise<Recommendation | null> {
  const cached = recommendations.find((r) => r.id === id) ?? exploreSpots.find((r) => r.id === id);
  if (cached) return cached;

  try {
    const doc = await fetchSpotById(id);
    return documentToRecommendation(doc);
  } catch {
    return null;
  }
}

export { planItemToRecommendation };

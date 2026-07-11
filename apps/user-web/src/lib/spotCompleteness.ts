import type { Recommendation } from "../data/spots.ts";
import type { SpotDocument } from "../types.ts";

const SPOT_IMAGE_PLACEHOLDER = "/spots/placeholder.svg";

function normalizeCategories(value?: string | string[] | null): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean);
}

function normalizeHighlights(value?: string[] | null): string[] {
  if (!value) return [];
  return value.map((s) => s.trim()).filter(Boolean);
}

type SpotLike = {
  name?: string | null;
  description?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  category?: string | string[] | null;
  highlights?: string[] | null;
};

/** user-web に表示するために必要な情報が揃っているか。 */
export function isDisplayableSpot(spot: SpotLike): boolean {
  if (!spot.name?.trim()) return false;
  if (!spot.description?.trim()) return false;
  if (!spot.address?.trim()) return false;
  if (!spot.imageUrl?.trim()) return false;
  if (normalizeCategories(spot.category).length === 0) return false;
  if (normalizeHighlights(spot.highlights).length === 0) return false;
  return true;
}

export function isDisplayableDocument(spot: SpotDocument): boolean {
  return isDisplayableSpot(spot);
}

/** localStorage 復元用。画像プレースホルダーは未登録扱い。 */
export function isDisplayableRecommendation(
  rec: Pick<Recommendation, "name" | "description" | "highlights" | "image">,
): boolean {
  if (!rec.name.trim()) return false;
  if (!rec.description.trim()) return false;
  if (!normalizeHighlights(rec.highlights).length) return false;
  if (!rec.image.trim() || rec.image === SPOT_IMAGE_PLACEHOLDER) return false;
  return true;
}

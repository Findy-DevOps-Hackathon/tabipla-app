import type { SpotRow } from "@tabipla/db";
import type { SpotDocument } from "@tabipla/search-core";

function normalizeCategories(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean);
}

function normalizeHighlights(value: string[] | null | undefined): string[] {
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

/** ユーザー向け API で公開するために必要な情報が揃っているか。 */
export function isPublicDisplayableSpot(spot: SpotLike): boolean {
  if (!spot.name?.trim()) return false;
  if (!spot.description?.trim()) return false;
  if (!spot.address?.trim()) return false;
  if (!spot.imageUrl?.trim()) return false;
  if (normalizeCategories(spot.category).length === 0) return false;
  if (normalizeHighlights(spot.highlights).length === 0) return false;
  return true;
}

export function isPublicDisplayableRow(row: SpotRow): boolean {
  return isPublicDisplayableSpot({
    name: row.name,
    description: row.description,
    address: row.address,
    imageUrl: row.imageUrl,
    category: row.category,
    highlights: row.highlights,
  });
}

export function isPublicDisplayableDocument(doc: SpotDocument): boolean {
  return isPublicDisplayableSpot(doc);
}

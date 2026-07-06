import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Spot } from "../contracts.js";

type SeedSpotRow = {
  id: string;
  name: string;
  description: string;
  category?: string | string[];
  tags?: string[];
  highlights?: string[];
  lat?: number | null;
  lon?: number | null;
  price?: number | null;
  imageUrl?: string | null;
};

const KOMORO_CENTER = { lat: 36.3263, lon: 138.4228 };
const DEFAULT_HOURS = { open: "09:00", close: "17:00", stayMin: 60 };

const AGENT_CATEGORY_BY_JP: Record<string, Spot["category"]> = {
  自然: "nature",
  "歴史・文化": "history",
  食: "gourmet",
  都市: "history",
  芸術: "history",
  "レジャー・スポーツ": "nature",
  イベント: "gourmet",
  ショッピング: "gourmet",
};

function resolveSeedDataDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/db/seed-data");
}

function loadSeedSpotRows(): SeedSpotRow[] {
  const raw = readFileSync(join(resolveSeedDataDir(), "spots.json"), "utf8");
  return JSON.parse(raw) as SeedSpotRow[];
}

function normalizeCategories(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toAgentCategory(categories: string[]): Spot["category"] {
  for (const category of categories) {
    const mapped = AGENT_CATEGORY_BY_JP[category];
    if (mapped) return mapped;
  }
  return "nature";
}

function toAgentSpot(row: SeedSpotRow): Spot {
  const categories = normalizeCategories(row.category);
  const tags = row.tags?.length
    ? row.tags
    : row.highlights?.length
      ? row.highlights.slice(0, 3)
      : categories.slice(0, 2);

  return {
    id: row.id,
    name: row.name,
    category: toAgentCategory(categories),
    location:
      row.lat != null && row.lon != null
        ? { lat: row.lat, lon: row.lon }
        : KOMORO_CENTER,
    priceLevel: Math.min(4, Math.max(0, row.price ?? 1)),
    description: row.description,
    tags,
  };
}

const seedRows = loadSeedSpotRows();

/** packages/db/seed-data/spots.json 由来のスポットカタログ。 */
export const KOMORO_SPOTS: Spot[] = seedRows.map(toAgentSpot);

export const SPOT_IMAGES: Record<string, string> = Object.fromEntries(
  seedRows
    .filter((row) => row.imageUrl)
    .map((row) => [row.id, row.imageUrl as string]),
);

export const SPOT_HOURS: Record<string, { open: string; close: string; stayMin: number }> =
  Object.fromEntries(KOMORO_SPOTS.map((spot) => [spot.id, DEFAULT_HOURS]));

export const SPOT_TAGS: Record<string, string[]> = Object.fromEntries(
  KOMORO_SPOTS.map((spot) => [spot.id, spot.tags ?? []]),
);

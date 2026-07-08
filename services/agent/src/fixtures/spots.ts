import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SpotDocument } from "@tabipla/search-core";
import type { Spot } from "../contracts.js";

type SeedSpotRow = {
  id: string;
  name: string;
  description: string;
  category?: string | string[];
  highlights?: string[];
  imageUrl?: string | null;
};

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

  return {
    id: row.id,
    name: row.name,
    category: toAgentCategory(categories),
    description: row.description,
    highlights: row.highlights?.slice(0, 3) ?? [],
  };
}

/** Elasticsearch / backend-api の SpotDocument を agent 契約型へ変換する。 */
export function mapSpotDocumentToAgentSpot(doc: SpotDocument): Spot {
  const categories = normalizeCategories(doc.category);
  return {
    id: doc.id,
    name: doc.name,
    category: toAgentCategory(categories),
    description: doc.description,
    highlights: doc.highlights?.slice(0, 3) ?? [],
  };
}

const seedRows = loadSeedSpotRows();

/** packages/db/seed-data/spots.json 由来のスポットカタログ。 */
export const KOMORO_SPOTS: Spot[] = seedRows.map(toAgentSpot);

export const SPOT_IMAGES: Record<string, string> = Object.fromEntries(
  seedRows.filter((row) => row.imageUrl).map((row) => [row.id, row.imageUrl as string]),
);

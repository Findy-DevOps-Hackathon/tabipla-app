import { pickAgentCategory } from "@tabipla/domain";
import type { SpotDocument } from "@tabipla/search-core";
import type { Spot } from "../contracts.js";

function normalizeCategories(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Elasticsearch / backend-api の SpotDocument を agent 契約型へ変換する。 */
export function mapSpotDocumentToAgentSpot(doc: SpotDocument): Spot {
  const categories = normalizeCategories(doc.category);
  return {
    id: doc.id,
    name: doc.name,
    category: pickAgentCategory(categories),
    description: doc.description,
    highlights: doc.highlights?.slice(0, 3) ?? [],
  };
}

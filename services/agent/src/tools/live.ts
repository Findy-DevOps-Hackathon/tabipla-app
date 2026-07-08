import { createElasticsearchClient, searchCandidateSpots } from "@tabipla/search-core";
import { embedText } from "../agents/embedding.js";
import type { GetUnchikuSourceFn, SearchFn } from "../contracts.js";
import { mapSpotDocumentToAgentSpot } from "../fixtures/spots.js";
import { fetchSpotFactsFromBackend } from "./spotFacts.js";

/** 同一リクエスト内で backend から渡された facts をツール呼び出しでも返す。 */
let pendingAskFacts: Map<string, string[]> | null = null;

export function setPendingAskFacts(spotId: string, facts: string[]): void {
  pendingAskFacts = new Map([[spotId, facts]]);
}

export function clearPendingAskFacts(): void {
  pendingAskFacts = null;
}

export const getUnchikuRepo: GetUnchikuSourceFn = async ({ spotId }) => {
  const cached = pendingAskFacts?.get(spotId);
  if (cached?.length) {
    return { spotId, facts: cached };
  }

  const facts = await fetchSpotFactsFromBackend(spotId);
  return { spotId, facts };
};

const AGENT_TO_ES_CATEGORIES: Record<string, string[]> = {
  nature: ["自然", "レジャー・スポーツ"],
  gourmet: ["食", "ショッピング"],
  history: ["歴史・文化", "都市", "芸術"],
};

export const searchEs: SearchFn = async (input) => {
  const client = createElasticsearchClient();
  const size = input.k ?? 8;
  const query = input.query?.trim() || undefined;
  const embedding = query ? await embedText(query, { taskType: "RETRIEVAL_QUERY" }) : undefined;
  const esCategories =
    input.category?.flatMap((category) => AGENT_TO_ES_CATEGORIES[category] ?? []) ?? [];

  const results = await searchCandidateSpots(client, {
    query,
    embedding,
    category: esCategories.length > 0 ? esCategories : undefined,
    size,
    k: size,
  });

  return results.map((result) => mapSpotDocumentToAgentSpot(result.document));
};

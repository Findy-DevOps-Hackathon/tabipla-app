import { createElasticsearchClient, searchCandidateSpots } from "@tabipla/search-core";
import { embedText } from "../agents/embedding.js";
import type { GetUnchikuSourceFn, SearchFn, TravelTimesFn } from "../contracts.js";
import { mapSpotDocumentToAgentSpot } from "../fixtures/spots.js";
import { backendApiBase, fetchSpotFactsFromBackend } from "./spotFacts.js";

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

const TRAVEL_MODE_MAP = {
  walk: "WALK",
  drive: "DRIVE",
  transit: "TRANSIT",
} as const;

type RoutesTravelMode = (typeof TRAVEL_MODE_MAP)[keyof typeof TRAVEL_MODE_MAP];

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
    near: input.center,
    radiusKm: input.radiusKm,
    size,
    k: size,
  });

  return results.map((result) => mapSpotDocumentToAgentSpot(result.document));
};

export const travelTimesReal: TravelTimesFn = async (input) => {
  const base = backendApiBase();
  if (!base) {
    throw new Error("[agent] BACKEND_API_URL が未設定です。travel_times を実行できません。");
  }

  const mode = TRAVEL_MODE_MAP[input.mode];
  const res = await fetch(`${base}/travel-times`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: input.origin,
      destinations: input.destinations.map((destination) => destination.at),
      modes: [mode],
      maxDestinations: input.destinations.length,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[agent] travel-times API エラー (${res.status}): ${body}`);
  }

  const matrix = (await res.json()) as {
    results?: Partial<Record<RoutesTravelMode, Array<{ durationSeconds: number | null }>>>;
  };
  const legs = matrix.results?.[mode] ?? [];

  return input.destinations.map((destination, index) => ({
    destId: destination.id,
    durationSec: legs[index]?.durationSeconds ?? 0,
  }));
};

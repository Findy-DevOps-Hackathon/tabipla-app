import type { GetUnchikuSourceFn, SearchFn, TravelTimesFn } from "../contracts.js";
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

export const searchEs: SearchFn = async () => {
  throw new Error("searchEs not ready — A3(searchCandidateSpots)完成後に実装");
};

export const travelTimesReal: TravelTimesFn = async () => {
  throw new Error("travelTimesReal not ready — A4(getTravelTimes)完成後に実装");
};

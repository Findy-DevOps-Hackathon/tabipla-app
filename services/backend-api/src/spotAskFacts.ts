import type { SpotRow } from "@tabipla/db";

export type AskSpotPayload = {
  name: string;
  description?: string;
  highlights?: string[];
  area?: string;
  prefecture?: string;
  address?: string;
};

function appendSpotFields(facts: string[], spot: AskSpotPayload): void {
  if (spot.name.trim()) facts.push(`名称: ${spot.name.trim()}`);
  const description = spot.description?.trim();
  if (description) facts.push(description);
  for (const highlight of spot.highlights ?? []) {
    const h = highlight.trim();
    if (h) facts.push(`おすすめポイント: ${h}`);
  }
  if (spot.address?.trim()) facts.push(`住所: ${spot.address.trim()}`);
  if (spot.prefecture || spot.area) {
    facts.push(`所在地: ${spot.prefecture ?? ""}${spot.area ?? ""}`);
  }
}

function toAskSpotPayload(spot: SpotRow): AskSpotPayload {
  return {
    name: spot.name,
    description: spot.description,
    highlights: spot.highlights ?? undefined,
    area: spot.area ?? undefined,
    prefecture: spot.prefecture ?? undefined,
    address: spot.address ?? undefined,
  };
}

/** AIガイド（紹介エージェント）向けに DB から回答根拠ファクトを組み立てる。 */
export function buildAskFacts(spot: SpotRow): string[] {
  const facts: string[] = [];
  appendSpotFields(facts, toAskSpotPayload(spot));
  return facts;
}

/** DB に無い場合、クライアントが保持しているスポット情報からファクトを組み立てる。 */
export function buildAskFactsFromClient(spot: AskSpotPayload): string[] {
  const facts: string[] = [];
  appendSpotFields(facts, spot);
  return facts;
}

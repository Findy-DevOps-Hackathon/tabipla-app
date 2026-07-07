export type SpotFactsSource = {
  name?: string;
  description?: string;
  highlights?: string[];
  address?: string;
  area?: string;
  prefecture?: string;
};

export function buildSpotFacts(spot: SpotFactsSource): string[] {
  const facts: string[] = [];
  if (spot.name?.trim()) facts.push(`名称: ${spot.name.trim()}`);
  if (spot.description?.trim()) facts.push(spot.description.trim());
  for (const h of spot.highlights ?? []) {
    const t = h?.trim();
    if (t) facts.push(`おすすめポイント: ${t}`);
  }
  if (spot.address?.trim()) facts.push(`住所: ${spot.address.trim()}`);
  if (spot.prefecture || spot.area) {
    facts.push(`所在地: ${spot.prefecture ?? ""}${spot.area ?? ""}`);
  }
  return facts;
}

export function backendApiBase(): string | undefined {
  const base = process.env.BACKEND_API_URL?.trim();
  return base ? base.replace(/\/$/, "") : undefined;
}

export async function fetchSpotFactsFromBackend(spotId: string): Promise<string[]> {
  const base = backendApiBase();
  if (!base) return [];

  try {
    const res = await fetch(`${base}/spots/${encodeURIComponent(spotId)}`);
    if (!res.ok) return [];
    const spot = (await res.json()) as SpotFactsSource;
    return buildSpotFacts(spot);
  } catch {
    return [];
  }
}

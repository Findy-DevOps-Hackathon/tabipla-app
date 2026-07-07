import { createHash } from "node:crypto";
import type { Swipes } from "./personalize.js";

/** キャッシュ有効期限（30分）。 */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** メモリ上限（超えたら最古エントリから削除）。 */
const MAX_CACHE_ENTRIES = 256;

export type CachedRankedItem = {
  id: string;
  name: string;
  category: string;
  highlights: string[];
  image: string;
  score: number;
  similarity: number;
};

export type CachedPlanRank = {
  planKey: string;
  profileSummary: string;
  result: string;
  ranked: CachedRankedItem[];
  createdAt: number;
};

const cache = new Map<string, CachedPlanRank>();

function sortedLikeWeights(weights?: Record<string, number>): Record<string, number> {
  if (!weights) return {};
  return Object.fromEntries(Object.entries(weights).sort(([a], [b]) => a.localeCompare(b)));
}

/** スワイプ入力・要望・カタログから決定的なキャッシュキーを生成する。 */
export function buildPlanCacheKey(sw: Swipes, travelMemory: string, catalogIds: string[]): string {
  const payload = JSON.stringify({
    likes: [...sw.likes].sort(),
    nopes: [...sw.nopes].sort(),
    likeWeights: sortedLikeWeights(sw.likeWeights),
    travelMemory: travelMemory.trim(),
    catalogIds: [...catalogIds].sort(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function evictExpired(now = Date.now()): void {
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

function evictOverflow(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export function getCachedPlanRank(planKey: string): CachedPlanRank | undefined {
  evictExpired();
  const entry = cache.get(planKey);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(planKey);
    return undefined;
  }
  return entry;
}

export function setCachedPlanRank(entry: CachedPlanRank): void {
  evictExpired();
  cache.set(entry.planKey, entry);
  evictOverflow();
}

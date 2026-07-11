import { COMPARISON_DIAGNOSIS_CATEGORIES, COMPARISON_SPOT_POOL } from "../data/comparisonSpots.ts";
import type { DiagnosisSpotCategory, SwipeSpot } from "../data/spots.ts";
import type { SpotDocument } from "../types.ts";
import { spotImageUrl } from "./spotMapper.ts";

/** API カタログがあれば画像 URL を最新化し、本番で存在するスポットに絞る。 */
function resolveComparisonPool(catalogDocs: readonly SpotDocument[]): readonly SwipeSpot[] {
  if (catalogDocs.length === 0) return COMPARISON_SPOT_POOL;

  const catalogById = new Map(catalogDocs.map((doc) => [doc.id, doc]));
  const matched = COMPARISON_SPOT_POOL.filter((spot) => catalogById.has(spot.id)).map((spot) => {
    const doc = catalogById.get(spot.id);
    return doc ? { ...spot, image: spotImageUrl(doc) } : spot;
  });

  return matched.length >= 2 ? matched : COMPARISON_SPOT_POOL;
}

/** Fisher–Yates で配列をシャッフルする（元配列は変更しない）。 */
function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j] as T;
    next[j] = tmp as T;
  }
  return next;
}

function pickRandomFromCategory(
  category: DiagnosisSpotCategory,
  pool: readonly SwipeSpot[],
  fallbackPool: readonly SwipeSpot[],
  excludeIds: ReadonlySet<string>,
): SwipeSpot | null {
  const inPool = shuffle(
    pool.filter((spot) => spot.category === category && !excludeIds.has(spot.id)),
  );
  if (inPool[0]) return inPool[0];

  const inFallback = shuffle(
    fallbackPool.filter((spot) => spot.category === category && !excludeIds.has(spot.id)),
  );
  return inFallback[0] ?? null;
}

/**
 * 好み診断用の比較デッキを固定プールから選ぶ。
 * 各診断カテゴリから最低1件ずつ（枠数が足りない場合は可能な限り）含め、残りをランダムで埋める。
 */
export function pickRandomComparisonDeck(
  count: number,
  excludeIds: readonly string[] = [],
  catalogDocs: readonly SpotDocument[] = [],
): SwipeSpot[] {
  const exclude = new Set(excludeIds);
  const comparisonPool = resolveComparisonPool(catalogDocs);
  const available = comparisonPool.filter((spot) => !exclude.has(spot.id));
  const pool = available.length >= count ? available : comparisonPool;
  const limit = Math.min(count, pool.length);
  if (limit === 0) return [];

  const picked: SwipeSpot[] = [];
  const pickedIds = new Set<string>(exclude);

  for (const category of shuffle(COMPARISON_DIAGNOSIS_CATEGORIES)) {
    if (picked.length >= limit) break;
    const spot = pickRandomFromCategory(category, pool, comparisonPool, pickedIds);
    if (!spot) continue;
    picked.push(spot);
    pickedIds.add(spot.id);
  }

  const remainder = shuffle(pool.filter((spot) => !pickedIds.has(spot.id)));
  for (const spot of remainder) {
    if (picked.length >= limit) break;
    picked.push(spot);
    pickedIds.add(spot.id);
  }

  return shuffle(picked);
}

/** 保存済み ID から比較デッキを復元する（プール外 ID は無視）。 */
export function resolveComparisonDeckFromIds(
  ids: readonly string[],
  catalogDocs: readonly SpotDocument[] = [],
): SwipeSpot[] {
  if (ids.length === 0) return [];
  const comparisonPool = resolveComparisonPool(catalogDocs);
  const byId = new Map(comparisonPool.map((spot) => [spot.id, spot]));
  return ids.map((id) => byId.get(id)).filter((spot): spot is SwipeSpot => spot !== undefined);
}

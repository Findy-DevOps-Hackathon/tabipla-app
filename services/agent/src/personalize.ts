import type { Spot } from "./contracts.js";
import { SPOT_TAGS } from "./fixtures/spots.js";

// ── 好み学習エンジン（モック）───────────────────────────────
// スワイプ(好き/興味なし)から好みプロフィールを作り、候補をスコアリングする。
// 透明・決定的な実装。本番は「埋め込みベクトルの類似度(A3)」に置き換える想定で、
// rankSpots() の中身だけ差し替えれば外側(API/UI)は無変更。

const CAT_JP: Record<string, string> = { nature: "自然", gourmet: "グルメ", history: "歴史" };

function tagsOf(spot: Spot): string[] {
  if (spot.tags?.length) return spot.tags;
  return SPOT_TAGS[spot.id] ?? [];
}

export interface Swipes {
  likes: string[];
  nopes: string[];
}
export interface PreferenceProfile {
  categoryScore: Record<string, number>;
  tagScore: Record<string, number>;
  preferredPriceMax: number | null;
  likedIds: string[];
  nopedIds: string[];
  feedbackNotes: string; // 推薦精度向上のためのメモ
  introStyle: string; // 紹介精度向上のためのメモ
}
export interface ScoredSpot {
  spot: Spot;
  score: number;
  why: string[];
}

// ユーザーごとのプロファイルを保持するインメモリDB
export const userProfiles = new Map<string, PreferenceProfile>();

export function buildProfile(sw: Swipes, catalog: Spot[]): PreferenceProfile {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const categoryScore: Record<string, number> = {};
  const tagScore: Record<string, number> = {};
  const likedPrices: number[] = [];
  const bump = (o: Record<string, number>, k: string, d: number) => {
    o[k] = (o[k] ?? 0) + d;
  };
  for (const id of sw.likes) {
    const s = byId.get(id);
    if (!s) continue;
    bump(categoryScore, s.category, 1);
    for (const t of tagsOf(s)) bump(tagScore, t, 1);
    likedPrices.push(s.priceLevel);
  }
  for (const id of sw.nopes) {
    const s = byId.get(id);
    if (!s) continue;
    bump(categoryScore, s.category, -1);
    for (const t of tagsOf(s)) bump(tagScore, t, -1);
  }
  return {
    categoryScore,
    tagScore,
    preferredPriceMax: likedPrices.length ? Math.max(...likedPrices) : null,
    likedIds: [...sw.likes],
    nopedIds: [...sw.nopes],
    feedbackNotes: "",
    introStyle: "",
  };
}

export function scoreSpot(p: PreferenceProfile, s: Spot): ScoredSpot {
  let score = 0;
  const why: string[] = [];
  const cat = p.categoryScore[s.category] ?? 0;
  score += cat;
  if (cat > 0) why.push(`${CAT_JP[s.category] ?? s.category}系が好み`);
  for (const t of tagsOf(s)) {
    const ts = p.tagScore[t] ?? 0;
    score += ts;
    if (ts > 0) why.push(`「${t}」が好み`);
  }
  if (p.preferredPriceMax != null) {
    if (s.priceLevel <= p.preferredPriceMax) score += 0.5;
    else score -= 0.5 * (s.priceLevel - p.preferredPriceMax);
  }
  return { spot: s, score: Math.round(score * 10) / 10, why: why.slice(0, 3) };
}

export function rankSpots(
  p: PreferenceProfile,
  catalog: Spot[],
  opts: { excludeNoped?: boolean } = {},
): ScoredSpot[] {
  const noped = new Set(p.nopedIds);
  return catalog
    .filter((s) => !(opts.excludeNoped && noped.has(s.id)))
    .map((s) => scoreSpot(p, s))
    .sort((a, b) => b.score - a.score);
}

export function summarizeProfile(p: PreferenceProfile): string {
  const topCats = Object.entries(p.categoryScore)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => CAT_JP[k] ?? k);
  const topTags = Object.entries(p.tagScore)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);
  const parts: string[] = [];
  if (topCats.length) parts.push(`カテゴリ: ${topCats.join("・")}`);
  if (topTags.length) parts.push(`好みの要素: ${topTags.join("・")}`);
  if (p.preferredPriceMax != null) {
    parts.push(`価格感: ${"¥".repeat(Math.max(1, p.preferredPriceMax))}前後まで`);
  }
  return parts.length
    ? parts.join(" / ")
    : "まだ好みが少なめ（もう少しスワイプすると精度が上がります）";
}

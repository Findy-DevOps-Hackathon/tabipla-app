import type { Spot } from "./contracts.js";

// ── 好みプロフィール（ルールベース要約）────────────────────
// スワイプ結果から LLM 紹介文用の profileSummary を生成する。
// ランキング本体は personalized.ts のベクトル類似度で行う。

const CAT_JP: Record<string, string> = { nature: "自然", gourmet: "グルメ", history: "歴史" };

function highlightsOf(spot: Spot): string[] {
  return spot.highlights ?? [];
}

export interface Swipes {
  likes: string[];
  nopes: string[];
  /** スワイプ勝ち数に基づく Like 重み（id → weight）。未指定時は各 Like を 1 として扱う。 */
  likeWeights?: Record<string, number>;
}
export interface PreferenceProfile {
  categoryScore: Record<string, number>;
  highlightScore: Record<string, number>;
  likedIds: string[];
  nopedIds: string[];
}

export function buildProfile(sw: Swipes, catalog: Spot[]): PreferenceProfile {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const categoryScore: Record<string, number> = {};
  const highlightScore: Record<string, number> = {};
  const bump = (o: Record<string, number>, k: string, d: number) => {
    o[k] = (o[k] ?? 0) + d;
  };
  for (const id of sw.likes) {
    const s = byId.get(id);
    if (!s) continue;
    const weight = Math.max(1, sw.likeWeights?.[id] ?? 1);
    bump(categoryScore, s.category, weight);
    for (const h of highlightsOf(s)) bump(highlightScore, h, weight);
  }
  for (const id of sw.nopes) {
    const s = byId.get(id);
    if (!s) continue;
    bump(categoryScore, s.category, -1);
    for (const h of highlightsOf(s)) bump(highlightScore, h, -1);
  }
  return {
    categoryScore,
    highlightScore,
    likedIds: [...sw.likes],
    nopedIds: [...sw.nopes],
  };
}

export function summarizeProfile(p: PreferenceProfile): string {
  const topCats = Object.entries(p.categoryScore)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => CAT_JP[k] ?? k);
  const topHighlights = Object.entries(p.highlightScore)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);
  const parts: string[] = [];
  if (topCats.length) parts.push(`カテゴリ: ${topCats.join("・")}`);
  if (topHighlights.length) parts.push(`好みの要素: ${topHighlights.join("・")}`);
  return parts.length
    ? parts.join(" / ")
    : "まだ好みが少なめ（もう少しスワイプすると精度が上がります）";
}

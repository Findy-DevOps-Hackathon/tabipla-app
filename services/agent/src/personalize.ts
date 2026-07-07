import { VECTOR_DIMS } from "@tabipla/search-core";
import type { Spot } from "./contracts.js";
import { extractThemesFromText } from "./themeRules.js";

// ── 好みプロフィール ────────────────────────────────────
// カテゴリ集計に加え、選択スポットの embedding ベクトルでも好みを解釈する。
// サブテーマは themeRules.ts のカテゴリ別辞書から抽出する。

const CAT_JP: Record<string, string> = {
  nature: "自然",
  gourmet: "グルメ",
  history: "歴史・文化",
};

const EMPTY_PROFILE_HINT = "まだ好みが少なめ（もう少し比較して選ぶと精度が上がります）";
const MIN_LIKES_FOR_FOCUS = 3;
/** 吹き出し・理由文に載せるサブテーマの上限 */
export const BUBBLE_THEME_LIMIT = 2;
const MAX_FOCUSED_THEMES = BUBBLE_THEME_LIMIT;
const MAX_FOCUSED_CATEGORIES = 2;
const MIN_THEME_COUNT_FOR_REFINE = 5;
const MIN_CATEGORY_COUNT_FOR_REFINE = 3;
const VECTOR_FOCUS_COHESION = 0.68;
const VECTOR_SCATTER_COHESION = 0.55;
const VECTOR_SUMMARY_TOP_K = 8;

type ScoredLabel = { label: string; score: number };

export type SpotEmbeddingRecord = {
  embedding?: number[];
  category?: string;
  highlights?: string[];
};

export type WeightedEmbedding = {
  embedding: number[];
  weight: number;
};

export type VectorPreferenceContext = {
  preferenceVector: number[] | null;
  likedEmbeddings: WeightedEmbedding[];
  catalog: Spot[];
  embeddingsById: Map<string, SpotEmbeddingRecord>;
  nopedIds: string[];
};

function highlightsOf(spot: Spot): string[] {
  return spot.highlights ?? [];
}

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const value of vec) sumSq += value * value;
  const norm = Math.sqrt(sumSq);
  if (norm > 0) return vec.map((value) => value / norm);
  return vec;
}

/** 正規化済み query と生ベクトルのコサイン類似度。 */
export function cosineSimilarity(normalizedQuery: number[], vec: number[]): number {
  let dot = 0;
  let normSq = 0;
  for (let i = 0; i < normalizedQuery.length; i++) {
    const q = normalizedQuery[i] ?? 0;
    const v = vec[i] ?? 0;
    dot += q * v;
    normSq += v * v;
  }
  const norm = Math.sqrt(normSq);
  return norm > 0 ? dot / norm : 0;
}

/** おすすめポイントの長文から、短い体験テーマ語を抽出する。 */
export { extractThemesFromHighlight, extractThemesFromText } from "./themeRules.js";

export interface Swipes {
  likes: string[];
  nopes: string[];
  /** 比較選択の勝ち数に基づく Like 重み（id → weight）。未指定時は各 Like を 1 として扱う。 */
  likeWeights?: Record<string, number>;
}

export interface PreferenceProfile {
  categoryScore: Record<string, number>;
  highlightScore: Record<string, number>;
  themeScore: Record<string, number>;
  likedIds: string[];
  nopedIds: string[];
}

export type ProfileFocusAssessment = {
  focused: boolean;
  needsRefinement: boolean;
  topCategories: string[];
  topThemes: string[];
  vectorCohesion: number | null;
  usedVectorSummary: boolean;
};

/** Like 重み付きで好みベクトルを構築する。 */
export function buildWeightedPreferenceVector(
  likes: string[],
  likeWeights: Record<string, number> | undefined,
  embeddingsById: Map<string, SpotEmbeddingRecord>,
): number[] | null {
  let totalWeight = 0;
  const vPref = new Array(VECTOR_DIMS).fill(0);

  for (const id of likes) {
    const embedding = embeddingsById.get(id)?.embedding;
    if (!embedding || embedding.length === 0) continue;

    const weight = Math.max(1, likeWeights?.[id] ?? 1);
    totalWeight += weight;
    for (let i = 0; i < VECTOR_DIMS; i++) {
      vPref[i] += (embedding[i] ?? 0) * weight;
    }
  }

  if (totalWeight === 0) return null;
  return l2Normalize(vPref.map((value) => value / totalWeight));
}

export function buildProfile(sw: Swipes, catalog: Spot[]): PreferenceProfile {
  const byId = new Map(catalog.map((spot) => [spot.id, spot]));
  const categoryScore: Record<string, number> = {};
  const highlightScore: Record<string, number> = {};
  const themeScore: Record<string, number> = {};
  const bump = (scores: Record<string, number>, key: string, delta: number) => {
    scores[key] = (scores[key] ?? 0) + delta;
  };
  const bumpThemes = (spot: Spot, delta: number) => {
    const themes = new Set<string>();
    for (const highlight of highlightsOf(spot)) {
      bump(highlightScore, highlight, delta);
      for (const theme of extractThemesFromText(highlight, spot.category, spot.description)) {
        themes.add(theme);
      }
    }
    if (themes.size === 0 && spot.description) {
      for (const theme of extractThemesFromText("", spot.category, spot.description)) {
        themes.add(theme);
      }
    }
    for (const theme of themes) bump(themeScore, theme, delta);
  };

  for (const id of sw.likes) {
    const spot = byId.get(id);
    if (!spot) continue;
    const weight = Math.max(1, sw.likeWeights?.[id] ?? 1);
    bump(categoryScore, spot.category, weight);
    bumpThemes(spot, weight);
  }
  for (const id of sw.nopes) {
    const spot = byId.get(id);
    if (!spot) continue;
    bump(categoryScore, spot.category, -1);
    bumpThemes(spot, -1);
  }

  return {
    categoryScore,
    highlightScore,
    themeScore,
    likedIds: [...sw.likes],
    nopedIds: [...sw.nopes],
  };
}

export function buildEmbeddingRecordMap(
  catalog: Spot[],
  esRecords: Map<string, SpotEmbeddingRecord>,
): Map<string, SpotEmbeddingRecord> {
  const map = new Map<string, SpotEmbeddingRecord>();
  for (const spot of catalog) {
    const es = esRecords.get(spot.id);
    map.set(spot.id, {
      embedding: es?.embedding,
      category: spot.category,
      highlights: spot.highlights ?? es?.highlights,
    });
  }
  for (const [id, es] of esRecords) {
    if (!map.has(id)) map.set(id, es);
  }
  return map;
}

export function buildLikedEmbeddings(
  sw: Swipes,
  embeddingsById: Map<string, SpotEmbeddingRecord>,
): WeightedEmbedding[] {
  const liked: WeightedEmbedding[] = [];
  for (const id of sw.likes) {
    const embedding = embeddingsById.get(id)?.embedding;
    if (!embedding || embedding.length === 0) continue;
    liked.push({
      embedding,
      weight: Math.max(1, sw.likeWeights?.[id] ?? 1),
    });
  }
  return liked;
}

/** 選択スポット同士のベクトル類似度（高いほど好みが一方向に集まっている）。 */
export function computeLikedEmbeddingsCohesion(
  likedEmbeddings: WeightedEmbedding[],
): number | null {
  if (likedEmbeddings.length < 2) return null;

  let weightedSimilarity = 0;
  let totalWeight = 0;
  for (let i = 0; i < likedEmbeddings.length; i++) {
    for (let j = i + 1; j < likedEmbeddings.length; j++) {
      const left = likedEmbeddings[i];
      const right = likedEmbeddings[j];
      if (!left || !right) continue;
      const weight = left.weight * right.weight;
      const similarity = cosineSimilarity(l2Normalize(left.embedding), right.embedding);
      weightedSimilarity += similarity * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSimilarity / totalWeight : null;
}

function toScoredLabels(
  scores: Record<string, number>,
  labeler?: (key: string) => string,
): ScoredLabel[] {
  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({ label: labeler ? labeler(key) : key, score }));
}

/** 好みベクトルに近いカタログ上位から、ベクトル空間上の好み傾向を要約する。 */
export function summarizeVectorPreference(
  preferenceVector: number[],
  catalog: Spot[],
  embeddingsById: Map<string, SpotEmbeddingRecord>,
  nopedIds: string[],
): { topCategories: ScoredLabel[]; topThemes: ScoredLabel[] } {
  const excluded = new Set(nopedIds);
  const nearest = catalog
    .filter((spot) => !excluded.has(spot.id))
    .map((spot) => {
      const record = embeddingsById.get(spot.id);
      const embedding = record?.embedding;
      if (!embedding || embedding.length === 0) return null;
      return {
        spot,
        record,
        similarity: cosineSimilarity(preferenceVector, embedding),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, VECTOR_SUMMARY_TOP_K);

  const categoryScores: Record<string, number> = {};
  const themeScores: Record<string, number> = {};

  for (const { spot, record, similarity } of nearest) {
    const category = spot.category || record.category || "観光";
    categoryScores[category] = (categoryScores[category] ?? 0) + similarity;
    for (const highlight of spot.highlights ?? record.highlights ?? []) {
      for (const theme of extractThemesFromText(highlight, category, spot.description)) {
        themeScores[theme] = (themeScores[theme] ?? 0) + similarity;
      }
    }
  }

  return {
    topCategories: toScoredLabels(categoryScores, (key) => CAT_JP[key] ?? key),
    topThemes: toScoredLabels(themeScores),
  };
}

function topCategoriesWithScores(profile: PreferenceProfile): ScoredLabel[] {
  return toScoredLabels(profile.categoryScore, (key) => CAT_JP[key] ?? key);
}

function topThemesWithScores(profile: PreferenceProfile): ScoredLabel[] {
  return toScoredLabels(profile.themeScore);
}

function assessProfileFocusRules(profile: PreferenceProfile): {
  needsRefinement: boolean;
  topCategories: string[];
  topThemes: string[];
} {
  const positiveCats = topCategoriesWithScores(profile);
  const positiveThemes = topThemesWithScores(profile);

  let needsRefinement = profile.likedIds.length < MIN_LIKES_FOR_FOCUS;
  if (positiveCats.length >= MIN_CATEGORY_COUNT_FOR_REFINE) {
    needsRefinement = true;
  }
  if (positiveThemes.length >= MIN_THEME_COUNT_FOR_REFINE) {
    needsRefinement = true;
  }

  const topCategories = positiveCats
    .slice(0, 2)
    .filter((entry, index, list) => {
      if (index === 0) return true;
      const top = list[0];
      return top ? entry.score >= top.score * 0.6 : false;
    })
    .map((entry) => entry.label);

  return {
    needsRefinement,
    topCategories,
    topThemes: [],
  };
}

function limitThemesForDisplay(themes: string[]): string[] {
  return themes.slice(0, BUBBLE_THEME_LIMIT);
}

function pickFocusedLabels(scored: ScoredLabel[], maxItems: number, focused: boolean): string[] {
  if (scored.length === 0) return [];
  return scored
    .slice(0, focused ? maxItems : 2)
    .filter((entry, index, list) => {
      if (index === 0) return true;
      const top = list[0];
      return focused && top ? entry.score >= top.score * 0.55 : index === 1;
    })
    .map((entry) => entry.label);
}

/** 好みが十分に絞れているかを判定する（ベクトル集中度を優先）。 */
export function assessProfileFocus(
  profile: PreferenceProfile,
  vector?: VectorPreferenceContext,
): ProfileFocusAssessment {
  const ruleFallback = assessProfileFocusRules(profile);
  let topCategories = ruleFallback.topCategories;
  let topThemes = ruleFallback.topThemes;
  let vectorCohesion: number | null = null;
  let usedVectorSummary = false;

  if (vector?.preferenceVector) {
    const summary = summarizeVectorPreference(
      vector.preferenceVector,
      vector.catalog,
      vector.embeddingsById,
      vector.nopedIds,
    );
    if (summary.topCategories.length > 0) {
      topCategories = pickFocusedLabels(summary.topCategories, MAX_FOCUSED_CATEGORIES, true);
      usedVectorSummary = true;
    }
    if (summary.topThemes.length > 0) {
      topThemes = pickFocusedLabels(summary.topThemes, MAX_FOCUSED_THEMES, true);
      usedVectorSummary = true;
    }
    vectorCohesion = computeLikedEmbeddingsCohesion(vector.likedEmbeddings);
  }

  let needsRefinement = profile.likedIds.length < MIN_LIKES_FOR_FOCUS;

  if (vectorCohesion !== null) {
    if (vectorCohesion >= VECTOR_FOCUS_COHESION) {
      needsRefinement = profile.likedIds.length < MIN_LIKES_FOR_FOCUS;
    } else if (vectorCohesion < VECTOR_SCATTER_COHESION) {
      needsRefinement = true;
    } else {
      needsRefinement = needsRefinement || ruleFallback.needsRefinement;
    }
  } else {
    needsRefinement = needsRefinement || ruleFallback.needsRefinement;
  }

  if (!usedVectorSummary) {
    const positiveThemes = topThemesWithScores(profile);
    topThemes = positiveThemes
      .slice(0, needsRefinement ? 0 : MAX_FOCUSED_THEMES)
      .map((entry) => entry.label);
  }

  return {
    focused: !needsRefinement,
    needsRefinement,
    topCategories,
    topThemes: limitThemesForDisplay(topThemes),
    vectorCohesion,
    usedVectorSummary,
  };
}

export function summarizeProfile(
  profile: PreferenceProfile,
  assessment?: ProfileFocusAssessment,
): string {
  const resolved = assessment ?? assessProfileFocus(profile);
  const parts: string[] = [];
  if (resolved.topCategories.length) {
    parts.push(`カテゴリ: ${resolved.topCategories.join("・")}`);
  }
  if (resolved.topThemes.length) {
    parts.push(`重視しそうな体験: ${limitThemesForDisplay(resolved.topThemes).join("・")}`);
  }
  return parts.length ? parts.join(" / ") : EMPTY_PROFILE_HINT;
}

function formatCategoryPreference(categories: string[]): string | null {
  if (categories.length === 0) return null;
  return `${categories.join("・")}に近い体験を多く選んでいただきました`;
}

function formatThemePreference(themes: string[], usedVectorSummary: boolean): string | null {
  const limited = limitThemesForDisplay(themes);
  if (limited.length === 0) return null;
  if (usedVectorSummary) {
    return `内容の似たスポットでは、${limited.join("・")}の方向に好みが集まっていました`;
  }
  return `${limited.join("・")}の体験に特に惹かれる傾向がありました`;
}

function formatBroadPreferenceHint(assessment: ProfileFocusAssessment): string {
  if (assessment.topCategories.length === 0) {
    return "いくつかの方向に関心がありそうですが、";
  }
  const label = assessment.topCategories.join("・");
  if (assessment.vectorCohesion !== null && assessment.vectorCohesion < VECTOR_SCATTER_COHESION) {
    return `選び方の内容がまだ${label}など複数の方向に分散しているようですが、`;
  }
  return `${label}などに関心がありそうですが、`;
}

/** 好み診断結果の解釈と旅の要望から、ユーザー向けのおすすめ理由文を組み立てる。 */
export function buildRecommendationReason(
  profile: PreferenceProfile,
  travelMemory = "",
  assessment?: ProfileFocusAssessment,
): string {
  const memory = travelMemory.trim();
  const resolved = assessment ?? assessProfileFocus(profile);
  const hasProfile =
    profile.likedIds.length > 0 && summarizeProfile(profile, resolved) !== EMPTY_PROFILE_HINT;

  if (resolved.needsRefinement && hasProfile) {
    const hint = formatBroadPreferenceHint(resolved);
    return `${hint}好みがまだ幅広く見えます。あと少し比較して選んでいただくと、よりあなたに合ったおすすめに絞れます。`;
  }

  const interpretation = [
    formatCategoryPreference(resolved.topCategories),
    formatThemePreference(resolved.topThemes, resolved.usedVectorSummary),
  ]
    .filter((part): part is string => Boolean(part))
    .join("。");

  if (hasProfile && memory) {
    const base = interpretation || "好み診断の回答から好みの傾向を読み取りました";
    return `${base}。さらに「${memory}」というご要望も踏まえて、おすすめを選びました。`;
  }
  if (hasProfile) {
    const base = interpretation || "好み診断の回答から好みの傾向を読み取りました";
    return `${base}。そのような体験を中心におすすめを選びました。`;
  }
  if (memory) {
    return `「${memory}」というご要望を踏まえて、合いそうなスポットを選びました。`;
  }
  return "人気の観光スポットを中心におすすめしています。";
}

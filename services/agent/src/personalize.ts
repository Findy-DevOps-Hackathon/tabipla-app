import { VECTOR_DIMS } from "@tabipla/search-core";
import type { Spot } from "./contracts.js";
import { extractThemesFromText } from "./themeRules.js";

// ── 好みプロフィール ────────────────────────────────────
// 選択スポットの embedding ベクトルとサブテーマ（themeRules）で好みを解釈する。
// 大カテゴリ（自然・歴史など）の集計は分析に使わない。

const EMPTY_PROFILE_HINT = "まだ好みが少なめ（もう少し比較して選ぶと精度が上がります）";
const MIN_LIKES_FOR_FOCUS = 3;
/** 吹き出し・理由文に載せるサブテーマの上限 */
export const BUBBLE_THEME_LIMIT = 2;
const MAX_FOCUSED_THEMES = BUBBLE_THEME_LIMIT;
const MIN_THEME_COUNT_FOR_REFINE = 5;
const VECTOR_FOCUS_COHESION = 0.68;
const VECTOR_SCATTER_COHESION = 0.55;
const VECTOR_SUMMARY_TOP_K = 8;
/** SwipeScreen の MAX_WINS_PER_SPOT と揃える */
const MAX_COMPARE_WINS = 3;
/** 3回選ばれたスポットは線形加重(3)より強く好みへ反映する */
const TRIPLE_WIN_LIKE_WEIGHT = 4;

/** 比較選択の勝ち数を、好みベクトル・テーマ集計用の重みに変換する。 */
export function resolveLikeWeight(rawWins?: number): number {
  const wins = Math.max(1, Math.floor(rawWins ?? 1));
  if (wins >= MAX_COMPARE_WINS) return TRIPLE_WIN_LIKE_WEIGHT;
  return wins;
}

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
  highlightScore: Record<string, number>;
  themeScore: Record<string, number>;
  likedIds: string[];
  nopedIds: string[];
}

export type ProfileFocusAssessment = {
  focused: boolean;
  needsRefinement: boolean;
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

    const weight = resolveLikeWeight(likeWeights?.[id]);
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
    const weight = resolveLikeWeight(sw.likeWeights?.[id]);
    bumpThemes(spot, weight);
  }
  for (const id of sw.nopes) {
    const spot = byId.get(id);
    if (!spot) continue;
    bumpThemes(spot, -1);
  }

  return {
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
      weight: resolveLikeWeight(sw.likeWeights?.[id]),
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
): { topThemes: ScoredLabel[] } {
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

  const themeScores: Record<string, number> = {};

  for (const { spot, record, similarity } of nearest) {
    const category = spot.category || record.category || "観光";
    for (const highlight of spot.highlights ?? record.highlights ?? []) {
      for (const theme of extractThemesFromText(highlight, category, spot.description)) {
        themeScores[theme] = (themeScores[theme] ?? 0) + similarity;
      }
    }
  }

  return {
    topThemes: toScoredLabels(themeScores),
  };
}

function topThemesWithScores(profile: PreferenceProfile): ScoredLabel[] {
  return toScoredLabels(profile.themeScore);
}

function assessProfileFocusRules(profile: PreferenceProfile): {
  needsRefinement: boolean;
  topThemes: string[];
} {
  const positiveThemes = topThemesWithScores(profile);

  let needsRefinement = profile.likedIds.length < MIN_LIKES_FOR_FOCUS;
  if (positiveThemes.length >= MIN_THEME_COUNT_FOR_REFINE) {
    needsRefinement = true;
  }

  return {
    needsRefinement,
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
  const themes = limitThemesForDisplay(resolved.topThemes);
  if (themes.length) {
    return `心が動く体験: ${themes.join("・")}`;
  }
  return EMPTY_PROFILE_HINT;
}

function formatThemesLabel(themes: string[]): string {
  if (themes.length === 0) return "";
  if (themes.length === 1) return themes[0]!;
  if (themes.length === 2) return `${themes[0]}と${themes[1]}`;
  return themes.join("・");
}

function formatThemePreference(themes: string[], usedVectorSummary: boolean): string | null {
  const limited = limitThemesForDisplay(themes);
  if (limited.length === 0) return null;
  const label = formatThemesLabel(limited);
  if (usedVectorSummary) {
    if (limited.length === 1) {
      return `${label}に、心がふっと踊るような体験がお好きなんですね`;
    }
    return `${label}…どちらも「行ってみたい」と思わせてくれる、そんな旅の感性を感じました`;
  }
  if (limited.length === 1) {
    return `${label}の時間が、あなたには特別に響きそうです`;
  }
  return `${label}、どちらも心惹かれる選び方でしたね`;
}

function formatBroadPreferenceHint(assessment: ProfileFocusAssessment): string {
  const themes = limitThemesForDisplay(assessment.topThemes);
  if (themes.length === 0) {
    return "わくわくする体験、いろいろ広がりそうですが、";
  }
  const label = formatThemesLabel(themes);
  if (assessment.vectorCohesion !== null && assessment.vectorCohesion < VECTOR_SCATTER_COHESION) {
    return `${label}など、ときめきがいろいろ散らばっている感じですが、`;
  }
  return `${label}にも心が動きそうですが、`;
}

const RECOMMENDATION_CLOSING =
  "そんなあなた向けのおすすめを、ここに集めました。\n私のおすすめスポットも載せました。";

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
    return `${hint}もう少し選んでいただければ、胸が高鳴るようなおすすめだけに絞れます。`;
  }

  const interpretation = formatThemePreference(resolved.topThemes, resolved.usedVectorSummary);

  if (hasProfile && memory) {
    const base = interpretation || "選び方から、あなたの旅への想いが伝わってきました";
    return `${base}。「${memory}」という気持ちも込めて、${RECOMMENDATION_CLOSING}`;
  }
  if (hasProfile) {
    const base = interpretation || "選び方から、あなたの旅への想いが伝わってきました";
    return `${base}。${RECOMMENDATION_CLOSING}`;
  }
  if (memory) {
    return `「${memory}」という想いに応えたいと思い、あなた向けのスポットを選びました。`;
  }
  return "まずは楽しめそうな場所を、わくわくする気持ちのまま集めてみました。";
}

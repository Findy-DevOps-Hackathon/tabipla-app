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
/** この値以上なら好みが絞れているとみなし、追加診断を促さない。 */
const VECTOR_FOCUS_COHESION = 0.56;
const VECTOR_SUMMARY_TOP_K = 8;
/** SwipeScreen の MAX_WINS_PER_SPOT と揃える */
const MAX_COMPARE_WINS = 3;
/** 3回選ばれたスポットは線形加重(3)より強く好みへ反映する */
const TRIPLE_WIN_LIKE_WEIGHT = 4;

type DeepPreferenceMotivationId =
  | "quietReset"
  | "storyDiscovery"
  | "sceneryAfterglow"
  | "localTaste"
  | "embodiedPlay"
  | "hiddenGem"
  | "openDiscovery";

type DeepPreferenceRule = {
  id: DeepPreferenceMotivationId;
  label: string;
  description: string;
  themes: string[];
  memoryPatterns: RegExp[];
};

function makeMemoryPatterns(...words: string[]): RegExp[] {
  return words.map((word) => new RegExp(word));
}

const DEEP_PREFERENCE_RULES: DeepPreferenceRule[] = [
  {
    id: "quietReset",
    label: "静けさで整う旅",
    description: "にぎやかさよりも、余白のある場所で心身をほどく時間を求めている",
    themes: ["温泉", "森林", "湖川", "自然公園", "ゆったり", "眺望"],
    memoryPatterns: makeMemoryPatterns(
      "静か",
      "ゆっくり",
      "のんびり",
      "癒",
      "疲",
      "リラックス",
      "落ち着",
    ),
  },
  {
    id: "storyDiscovery",
    label: "土地の物語をたどる旅",
    description: "景色の裏側にある歴史や文化、そこで暮らした人の気配に惹かれている",
    themes: [
      "城",
      "神社・寺院",
      "街道",
      "町家",
      "近代史",
      "産業",
      "参拝",
      "文化財",
      "文学",
      "伝統工芸",
    ],
    memoryPatterns: makeMemoryPatterns(
      "歴史",
      "物語",
      "昔",
      "文化",
      "学び",
      "知りたい",
      "由来",
      "背景",
    ),
  },
  {
    id: "sceneryAfterglow",
    label: "景色の余韻を持ち帰る旅",
    description: "体験の派手さより、あとから思い出したくなる眺めや空気感を大事にしている",
    themes: ["眺望", "海", "高原", "紅葉", "花", "景観", "写真映え"],
    memoryPatterns: makeMemoryPatterns(
      "景色",
      "絶景",
      "眺め",
      "写真",
      "夕日",
      "朝日",
      "映え",
      "空気",
    ),
  },
  {
    id: "localTaste",
    label: "土地の味と暮らしに触れる旅",
    description: "名所を見るだけでなく、食や買い物を通して地域の日常に近づきたい",
    themes: [
      "ワイン",
      "酒蔵",
      "果物狩り",
      "郷土料理",
      "カフェ",
      "市場",
      "食事体験",
      "地産地消",
      "ショッピング",
    ],
    memoryPatterns: makeMemoryPatterns(
      "食",
      "ごはん",
      "カフェ",
      "ワイン",
      "酒",
      "市場",
      "地元",
      "土産",
      "暮らし",
    ),
  },
  {
    id: "embodiedPlay",
    label: "自分で体験して残る旅",
    description: "眺めるだけでなく、歩く・作る・参加することで旅の記憶を身体に残したい",
    themes: ["体験", "散策", "家族向け", "遊園", "動物園", "科学・学び", "アクセス"],
    memoryPatterns: makeMemoryPatterns(
      "体験",
      "歩き",
      "散策",
      "子ども",
      "家族",
      "遊び",
      "参加",
      "アクティブ",
    ),
  },
  {
    id: "hiddenGem",
    label: "人混みを避けて発見する旅",
    description: "有名さよりも、自分だけの発見や静かな穴場感に価値を感じている",
    themes: ["ゆったり", "散策", "町家", "文学", "森林"],
    memoryPatterns: makeMemoryPatterns(
      "穴場",
      "混雑",
      "人混み",
      "静か",
      "知らない",
      "マイナー",
      "隠れ",
    ),
  },
];

const DEFAULT_DEEP_PREFERENCE = {
  id: "openDiscovery" as const,
  label: "偶然の発見を楽しむ旅",
  description: "まだ好みを絞り込みすぎず、直感で気になる場所との出会いを楽しめそう",
  score: 0,
};

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
export { extractThemesFromText } from "./themeRules.js";

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

export type DeepPreferenceMotivation = {
  id: DeepPreferenceMotivationId;
  label: string;
  description: string;
  score: number;
};

export type DeepPreferenceInsight = {
  primary: DeepPreferenceMotivation;
  secondary: DeepPreferenceMotivation[];
  confidence: "low" | "medium" | "high";
  cues: string[];
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

function scoreDeepPreferenceRule(
  rule: DeepPreferenceRule,
  profile: PreferenceProfile,
  travelMemory: string,
): number {
  let score = 0;
  for (const theme of rule.themes) {
    score += Math.max(0, profile.themeScore[theme] ?? 0);
  }
  for (const pattern of rule.memoryPatterns) {
    if (pattern.test(travelMemory)) score += 2;
  }
  return score;
}

function confidenceForDeepPreference(
  topScore: number,
  profile: PreferenceProfile,
  assessment: ProfileFocusAssessment,
): DeepPreferenceInsight["confidence"] {
  if (topScore <= 0) return "low";
  if (profile.likedIds.length >= MIN_LIKES_FOR_FOCUS && assessment.focused && topScore >= 4) {
    return "high";
  }
  if (profile.likedIds.length >= 2 || topScore >= 3) return "medium";
  return "low";
}

export function buildDeepPreferenceInsight(
  profile: PreferenceProfile,
  travelMemory = "",
  assessment?: ProfileFocusAssessment,
): DeepPreferenceInsight {
  const resolved = assessment ?? assessProfileFocus(profile);
  const scored = DEEP_PREFERENCE_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    description: rule.description,
    score: scoreDeepPreferenceRule(rule, profile, travelMemory.trim()),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = scored[0] ?? DEFAULT_DEEP_PREFERENCE;
  const confidence = confidenceForDeepPreference(primary.score, profile, resolved);
  const cues = [
    ...resolved.topThemes,
    ...scored
      .slice(0, 2)
      .flatMap((item) => DEEP_PREFERENCE_RULES.find((rule) => rule.id === item.id)?.themes ?? []),
  ];

  return {
    primary,
    secondary: scored.slice(1, 3),
    confidence,
    cues: [...new Set(cues)].slice(0, 4),
  };
}

function themesForSpot(spot: Spot): Set<string> {
  const themes = new Set<string>();
  for (const highlight of highlightsOf(spot)) {
    for (const theme of extractThemesFromText(highlight, spot.category, spot.description)) {
      themes.add(theme);
    }
  }
  if (themes.size === 0 && spot.description) {
    for (const theme of extractThemesFromText("", spot.category, spot.description)) {
      themes.add(theme);
    }
  }
  return themes;
}

export function scoreSpotByDeepPreference(spot: Spot, insight: DeepPreferenceInsight): number {
  if (insight.confidence === "low") return 0;
  const themes = themesForSpot(spot);
  let score = 0;
  const motivations = [insight.primary, ...insight.secondary];
  for (const motivation of motivations) {
    const rule = DEEP_PREFERENCE_RULES.find((item) => item.id === motivation.id);
    if (!rule) continue;
    const weight = motivation.id === insight.primary.id ? 1.8 : 0.9;
    for (const theme of rule.themes) {
      if (themes.has(theme)) score += weight;
    }
  }
  return score;
}

function assessProfileFocusRules(profile: PreferenceProfile): {
  needsRefinement: boolean;
  topThemes: string[];
} {
  const positiveThemes = topThemesWithScores(profile);

  return {
    needsRefinement: positiveThemes.length >= MIN_THEME_COUNT_FOR_REFINE,
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

  const needsRefinement =
    vectorCohesion !== null ? vectorCohesion < VECTOR_FOCUS_COHESION : ruleFallback.needsRefinement;

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
  deepInsight?: DeepPreferenceInsight,
): string {
  const resolved = assessment ?? assessProfileFocus(profile);
  const themes = limitThemesForDisplay(resolved.topThemes);
  const deepSummary =
    deepInsight && deepInsight.confidence !== "low"
      ? ` / 深層ニーズ: ${deepInsight.primary.label}`
      : "";
  if (themes.length) {
    return `心が動く体験: ${themes.join("・")}${deepSummary}`;
  }
  if (deepSummary) {
    return `心が動く体験: 探索中${deepSummary}`;
  }
  return EMPTY_PROFILE_HINT;
}

function formatThemesLabel(themes: string[]): string {
  if (themes.length === 0) return "";
  const firstTheme = themes[0];
  if (themes.length === 1) return firstTheme ?? "";
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
  if (assessment.vectorCohesion !== null && assessment.vectorCohesion < VECTOR_FOCUS_COHESION) {
    return `${label}など、ときめきがいろいろ散らばっている感じですが、`;
  }
  return `${label}にも心が動きそうですが、`;
}

function formatDeepPreferenceLead(insight: DeepPreferenceInsight): string | null {
  if (insight.confidence === "low") return null;
  const secondaryLabels = insight.secondary.map((item) => item.label).slice(0, 1);
  if (secondaryLabels.length > 0) {
    return `深く見ると、${insight.primary.label}を軸に、${secondaryLabels.join("・")}も大事にしているようです`;
  }
  return `深く見ると、${insight.primary.label}に惹かれているようです`;
}

/** 好み診断結果の解釈と旅の要望から、ユーザー向けのおすすめ理由文を組み立てる。 */
export function buildRecommendationReason(
  profile: PreferenceProfile,
  travelMemory = "",
  assessment?: ProfileFocusAssessment,
  deepInsight?: DeepPreferenceInsight,
): string {
  const memory = travelMemory.trim();
  const resolved = assessment ?? assessProfileFocus(profile);
  const hasProfile =
    profile.likedIds.length > 0 &&
    summarizeProfile(profile, resolved, deepInsight) !== EMPTY_PROFILE_HINT;
  const insight = deepInsight ?? buildDeepPreferenceInsight(profile, memory, resolved);
  const deepLead = formatDeepPreferenceLead(insight);

  if (resolved.needsRefinement && hasProfile) {
    const hint = formatBroadPreferenceHint(resolved);
    return `${deepLead ? `${deepLead}。` : ""}${hint}もう少し選んでいただければ、胸が高鳴るようなおすすめだけに絞れます。`;
  }

  const interpretation = formatThemePreference(resolved.topThemes, resolved.usedVectorSummary);
  const baseLead = deepLead ? `${deepLead}。` : "";

  if (hasProfile && memory) {
    const base = interpretation || "選び方から、あなたの旅への想いが伝わってきました";
    return `${baseLead}${base}。「${memory}」という気持ちも込めて`;
  }
  if (hasProfile) {
    const base = interpretation || "選び方から、あなたの旅への想いが伝わってきました";
    return `${baseLead}${base}。`;
  }
  if (memory) {
    return `${baseLead}「${memory}」という想いに応えたいと思い、あなた向けのスポットを選びました。`;
  }
  return "まずは楽しめそうな場所を、わくわくする気持ちのまま集めてみました。";
}

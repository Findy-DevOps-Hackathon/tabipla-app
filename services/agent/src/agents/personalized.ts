import {
  createElasticsearchClient,
  DEFAULT_INDEX_NAME,
  type SpotDocument,
  searchCandidateSpots,
  VECTOR_DIMS,
} from "@tabipla/search-core";
import type { Spot } from "../contracts.js";
import {
  assessProfileFocus,
  buildDeepPreferenceInsight,
  buildEmbeddingRecordMap,
  buildLikedEmbeddings,
  buildProfile,
  buildRecommendationReason,
  buildWeightedPreferenceVector,
  type DeepPreferenceInsight,
  extractThemesFromText,
  type PreferenceProfile,
  resolveLikeWeight,
  type SpotEmbeddingRecord,
  type Swipes,
  scoreSpotByDeepPreference,
  summarizeProfile,
} from "../personalize.js";
import {
  buildPlanCacheKey,
  type CachedPlanRank,
  type CachedRankedItem,
  getCachedPlanRank,
  setCachedPlanRank,
} from "../planRankCache.js";
import { embedText } from "./embedding.js";
import { runIntro } from "./intro.js";

export interface Recommendation {
  id: string;
  name: string;
  category: string;
  highlights: string[];
  image: string;
  score: number;
}

export interface PersonalizedResult {
  profileSummary: string;
  recommendations: Recommendation[];
  result: string;
  needsRefinement: boolean;
  total: number;
  page: number;
  limit: number;
  planKey: string;
}

export type PersonalizedPlanOptions = {
  page?: number;
  limit?: number;
  /** 1ページ目で返却されたキー。2ページ目以降のキャッシュ参照に使用。 */
  planKey?: string;
};

/** LLM 紹介文生成に渡す上位候補数。 */
const LLM_INTRO_POOL = 15;

/** catalog 未指定時のフォールバック k-NN 件数。 */
const GLOBAL_KNN_LIMIT = 15;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

type EsSpotRecord = Record<string, unknown> & {
  id: string;
  embedding?: number[];
};

type RankedCandidate = {
  candidate: EsSpotRecord;
  similarity: number;
};

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    return vec.map((v) => v / norm);
  }
  return vec;
}

function similarityToScore(similarity: number): number {
  return Math.round(Math.max(0, Math.min(1, similarity)) * 100) / 100;
}

function normalizePagination(options?: PersonalizedPlanOptions): { page: number; limit: number } {
  const page = Math.max(DEFAULT_PAGE, Math.floor(options?.page ?? DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(options?.limit ?? DEFAULT_LIMIT)));
  return { page, limit };
}

function hasStoredEmbedding(record?: SpotEmbeddingRecord): boolean {
  return Array.isArray(record?.embedding) && record.embedding.length > 0;
}

function buildLikeEmbedText(catalogSpot?: Spot, esRecord?: EsSpotRecord): string {
  const name = catalogSpot?.name ?? String(esRecord?.name ?? "");
  const description = catalogSpot?.description ?? String(esRecord?.description ?? "");
  const rawCategory = catalogSpot?.category ?? esRecord?.category;
  const categories = Array.isArray(rawCategory)
    ? rawCategory.map(String)
    : rawCategory
      ? [String(rawCategory)]
      : [];
  const highlights =
    catalogSpot?.highlights ??
    (Array.isArray(esRecord?.highlights) ? (esRecord.highlights as string[]) : []);
  return [name, description, ...categories, ...highlights].filter(Boolean).join("\n");
}

function countLikesWithEmbedding(
  likes: string[],
  embeddingsById: Map<string, SpotEmbeddingRecord>,
): number {
  return likes.filter((id) => hasStoredEmbedding(embeddingsById.get(id))).length;
}

/** ES に embedding が無い Like スポットをテキストから生成して補完する。 */
async function enrichEmbeddingsForLikes(
  sw: Swipes,
  catalogSpots: Spot[],
  esById: Map<string, EsSpotRecord>,
  embeddingsById: Map<string, SpotEmbeddingRecord>,
): Promise<Map<string, SpotEmbeddingRecord>> {
  const catalogById = new Map(catalogSpots.map((spot) => [spot.id, spot]));
  const enriched = new Map(embeddingsById);
  let generated = 0;

  for (const id of sw.likes) {
    if (hasStoredEmbedding(enriched.get(id))) continue;

    const text = buildLikeEmbedText(catalogById.get(id), esById.get(id));
    if (!text.trim()) continue;

    try {
      const embedding = await embedText(text, { taskType: "RETRIEVAL_DOCUMENT" });
      const existing = enriched.get(id);
      enriched.set(id, {
        category: existing?.category ?? catalogById.get(id)?.category,
        highlights: existing?.highlights ?? catalogById.get(id)?.highlights,
        embedding,
      });
      generated += 1;
    } catch (e) {
      console.error(`[personalizedPlan] Like ${id} の embedding 生成に失敗:`, e);
    }
  }

  if (generated > 0) {
    console.log(`[personalizedPlan] ES に無かった Like embedding を ${generated} 件生成しました`);
  }

  return enriched;
}

async function fetchSpotsFromEsByIds(ids: string[]): Promise<Map<string, EsSpotRecord>> {
  if (ids.length === 0) return new Map();
  const es = createElasticsearchClient();
  try {
    const res = await es.mget({
      index: DEFAULT_INDEX_NAME,
      ids,
    });

    const map = new Map<string, EsSpotRecord>();
    for (const doc of res.docs) {
      if ("error" in doc || !doc.found || !doc._id) continue;
      map.set(doc._id, { id: doc._id, ...(doc._source as Record<string, unknown>) });
    }

    const withEmbedding = [...map.values()].filter(
      (record) => Array.isArray(record.embedding) && record.embedding.length > 0,
    ).length;
    console.log(
      `[personalizedPlan] ES lookup ${map.size}/${ids.length} 件, embedding=${withEmbedding}`,
    );

    return map;
  } catch (e) {
    console.error("[personalized] fetchSpotsFromEsByIdsエラー:", e);
    return new Map();
  }
}

function buildPersonalizedSearchQuery(
  profileSummary: string,
  travelMemory: string,
  deepInsight: DeepPreferenceInsight,
): string {
  return [
    profileSummary,
    deepInsight.confidence !== "low" ? deepInsight.primary.label : "",
    deepInsight.confidence !== "low" ? deepInsight.primary.description : "",
    ...deepInsight.cues,
    travelMemory.trim(),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function esScoreToRankSimilarity(index: number, total: number): number {
  if (total <= 1) return 0.9;
  // 順位を [0.05, 0.90] に線形写像（以前は下限 0.45 で下位が中央に寄っていた）
  return Math.max(0.05, 0.9 - (index / (total - 1)) * 0.85);
}

/** 自然文 + ベクトル + ID filter で、目的地カタログ内の候補を ES から広めに取得する。 */
async function rankCatalogByEsCandidates(
  queryVector: number[],
  catalogSpots: Spot[],
  excludeIds: string[],
  searchQuery: string,
): Promise<RankedCandidate[]> {
  const exclude = new Set(excludeIds);
  const targetSpots = catalogSpots.filter((spot) => !exclude.has(spot.id));
  if (targetSpots.length === 0) return [];

  const catalogIds = targetSpots.map((spot) => spot.id);
  const size = catalogIds.length;
  const es = createElasticsearchClient();

  try {
    const results = await searchCandidateSpots(es, {
      index: DEFAULT_INDEX_NAME,
      query: searchQuery,
      embedding: queryVector,
      ids: catalogIds,
      excludeIds,
      size,
      k: size,
      knnBoost: 1.2,
    });

    const catalogById = new Map(targetSpots.map((spot) => [spot.id, spot]));
    return results
      .map((result, index) => {
        const catalogSpot = catalogById.get(result.id);
        if (!catalogSpot) return null;
        const esRecord: EsSpotRecord = {
          id: result.id,
          ...(result.document as Record<string, unknown>),
        };
        return {
          candidate: mergeCatalogSpot(catalogSpot, esRecord),
          similarity: esScoreToRankSimilarity(index, results.length),
        };
      })
      .filter((r): r is RankedCandidate => r !== null);
  } catch (e) {
    console.error("[personalized] rankCatalogByEsCandidatesエラー:", e);
    return [];
  }
}

function mergeCatalogSpot(catalogSpot: Spot, es?: EsSpotRecord): EsSpotRecord {
  return {
    ...es,
    id: catalogSpot.id,
    name: catalogSpot.name,
    category: catalogSpot.category,
    description: catalogSpot.description ?? es?.description,
    highlights: catalogSpot.highlights ?? es?.highlights,
  };
}

/** catalog 未指定時のフォールバック: ES 全件 k-NN。 */
async function searchCandidatesGlobal(
  queryVector: number[],
  excludeIds: string[],
): Promise<RankedCandidate[]> {
  const es = createElasticsearchClient();
  try {
    const knn: {
      field: string;
      query_vector: number[];
      k: number;
      num_candidates: number;
      filter?: { bool: { must_not: { ids: { values: string[] } }[] } };
    } = {
      field: "embedding",
      query_vector: queryVector,
      k: GLOBAL_KNN_LIMIT,
      num_candidates: 50,
      ...(excludeIds.length > 0
        ? {
            filter: {
              bool: {
                must_not: [{ ids: { values: excludeIds } }],
              },
            },
          }
        : {}),
    };

    const res = await es.search({
      index: DEFAULT_INDEX_NAME,
      knn,
      size: GLOBAL_KNN_LIMIT,
    });

    return res.hits.hits.map((h, index) => ({
      candidate: {
        id: h._id ?? "",
        ...(h._source as Record<string, unknown>),
      } as EsSpotRecord,
      similarity: typeof h._score === "number" ? h._score : Math.max(0, 1 - index * 0.05),
    }));
  } catch (e) {
    console.error("[personalized] searchCandidatesGlobalエラー:", e);
    return [];
  }
}

const UNSPLASH_IMAGES = [
  "https://images.unsplash.com/photo-1542044896530-05d85be9b11a?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80",
];

function toIntroSpot(cand: EsSpotRecord): SpotDocument {
  return {
    id: cand.id,
    name: String(cand.name ?? ""),
    description: String(cand.description ?? ""),
    category: cand.category as SpotDocument["category"],
    area: typeof cand.area === "string" ? cand.area : undefined,
    prefecture: typeof cand.prefecture === "string" ? cand.prefecture : undefined,
    address: typeof cand.address === "string" ? cand.address : undefined,
    highlights: Array.isArray(cand.highlights) ? (cand.highlights as string[]) : undefined,
    imageUrl: typeof cand.imageUrl === "string" ? cand.imageUrl : undefined,
  };
}

function toRecommendation(cand: EsSpotRecord, score: number): Recommendation {
  const category = cand.category;
  return {
    id: cand.id,
    name: String(cand.name ?? ""),
    category: Array.isArray(category) ? category[0] || "観光" : String(category || "観光"),
    highlights: Array.isArray(cand.highlights) ? (cand.highlights as string[]) : [],
    image:
      String(cand.imageUrl ?? cand.image ?? "") ||
      (UNSPLASH_IMAGES[Math.floor(Math.random() * UNSPLASH_IMAGES.length)] ?? ""),
    score,
  };
}

function rankedToCachedItems(rankedAll: RankedCandidate[]): CachedRankedItem[] {
  return rankedAll.map((entry) => {
    const rec = toRecommendation(entry.candidate, similarityToScore(entry.similarity));
    return { ...rec, similarity: entry.similarity };
  });
}

function toEsEmbeddingRecords(esById: Map<string, EsSpotRecord>): Map<string, SpotEmbeddingRecord> {
  const map = new Map<string, SpotEmbeddingRecord>();
  for (const [id, record] of esById) {
    map.set(id, {
      embedding: record.embedding,
      category: Array.isArray(record.category)
        ? String(record.category[0] ?? "")
        : String(record.category ?? ""),
      highlights: Array.isArray(record.highlights) ? (record.highlights as string[]) : undefined,
    });
  }
  return map;
}

function extractThemesAcrossCategories(text: string): Set<string> {
  const themes = new Set<string>();
  for (const category of ["自然", "歴史・文化", "食", "レジャー・スポーツ"]) {
    for (const theme of extractThemesFromText(text, category, text)) {
      themes.add(theme);
    }
  }
  return themes;
}

function spotThemes(spot: Spot): Set<string> {
  const themes = new Set<string>();
  const highlights = spot.highlights ?? [];
  for (const highlight of highlights) {
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

function scoreCatalogSpotByRules(
  spot: Spot,
  profile: PreferenceProfile,
  memoryThemes: Set<string>,
  deepInsight: DeepPreferenceInsight,
): number {
  let score = 0;

  for (const highlight of spot.highlights ?? []) {
    score += profile.highlightScore[highlight] ?? 0;
  }

  for (const theme of spotThemes(spot)) {
    score += (profile.themeScore[theme] ?? 0) * 2;
    if (memoryThemes.has(theme)) score += 2.5;
  }

  score += scoreSpotByDeepPreference(spot, deepInsight);
  return score;
}

/** ES / embedding が不調でも、診断結果と旅の記憶からカタログ内で決定的に並べる。 */
function rankCatalogByRules(
  profile: PreferenceProfile,
  travelMemory: string,
  catalogSpots: Spot[],
  excludeIds: string[],
  deepInsight: DeepPreferenceInsight,
): RankedCandidate[] {
  const exclude = new Set(excludeIds);
  const memoryThemes = extractThemesAcrossCategories(travelMemory);
  const scored = catalogSpots
    .filter((spot) => !exclude.has(spot.id))
    .map((spot, index) => ({
      spot,
      index,
      rawScore: scoreCatalogSpotByRules(spot, profile, memoryThemes, deepInsight),
    }))
    .sort((a, b) => {
      const diff = b.rawScore - a.rawScore;
      return diff !== 0 ? diff : a.index - b.index;
    });

  if (scored.length === 0) return [];

  const minScore = Math.min(...scored.map((entry) => entry.rawScore));
  const maxScore = Math.max(...scored.map((entry) => entry.rawScore));
  const spread = maxScore - minScore;

  return scored.map(({ spot, rawScore }, index) => {
    const normalized =
      spread > 0 ? (rawScore - minScore) / spread : Math.max(0, 1 - index / scored.length);
    return {
      candidate: mergeCatalogSpot(spot),
      similarity: 0.35 + normalized * 0.55,
    };
  });
}

function rerankWithRuleSignal(
  ranked: RankedCandidate[],
  fallback: RankedCandidate[],
): RankedCandidate[] {
  if (ranked.length === 0) return fallback;

  const fallbackById = new Map(fallback.map((entry) => [entry.candidate.id, entry]));
  const seen = new Set(ranked.map((entry) => entry.candidate.id));
  const blended = ranked.map((entry) => {
    const ruleScore = fallbackById.get(entry.candidate.id)?.similarity ?? entry.similarity;
    return {
      ...entry,
      similarity: entry.similarity * 0.68 + ruleScore * 0.32,
    };
  });

  const missing = fallback.filter((entry) => !seen.has(entry.candidate.id));
  if (missing.length === 0) {
    return blended.sort((a, b) => b.similarity - a.similarity);
  }

  const lastSimilarity = Math.min(...blended.map((entry) => entry.similarity));
  const appended = missing.map((entry, index) => ({
    ...entry,
    similarity: Math.max(0.01, Math.min(entry.similarity, lastSimilarity - 0.01 * (index + 1))),
  }));
  return [...blended, ...appended].sort((a, b) => b.similarity - a.similarity);
}

function logRankedScores(
  ranked: CachedRankedItem[],
  page: number,
  limit: number,
  fromCache: boolean,
): void {
  const start = (page - 1) * limit;
  const logItems = page === DEFAULT_PAGE ? ranked : ranked.slice(start, start + limit);
  const logLabel =
    page === DEFAULT_PAGE
      ? `[personalizedPlan] スコア (全 ${ranked.length} 件${fromCache ? ", cache" : ""})`
      : `[personalizedPlan] スコア (page ${page}, ${logItems.length} 件${fromCache ? ", cache" : ""})`;
  console.log(logLabel);
  for (const [index, entry] of logItems.entries()) {
    const rank = page === DEFAULT_PAGE ? index + 1 : start + index + 1;
    console.log(
      `  ${rank}. ${entry.id} ${entry.name} similarity=${entry.similarity.toFixed(4)} score=${entry.score.toFixed(2)}`,
    );
  }
}

function sliceCachedPlan(cached: CachedPlanRank, page: number, limit: number): PersonalizedResult {
  const start = (page - 1) * limit;
  const pageItems = cached.ranked.slice(start, start + limit);
  return {
    profileSummary: cached.profileSummary,
    recommendations: pageItems.map(({ similarity: _s, ...rec }) => rec),
    result: page === DEFAULT_PAGE ? cached.result : "",
    needsRefinement: page === DEFAULT_PAGE ? cached.needsRefinement : false,
    total: cached.ranked.length,
    page,
    limit,
    planKey: cached.planKey,
  };
}

function introMentionsSpotNames(text: string, spots: SpotDocument[]): boolean {
  return spots.some((spot) => {
    const name = spot.name?.trim();
    return Boolean(name && name.length >= 2 && text.includes(name));
  });
}

async function computeAndCachePlan(
  sw: Swipes,
  travelMemory: string,
  catalogSpots: Spot[],
  planKey: string,
): Promise<CachedPlanRank> {
  const profile = buildProfile(sw, catalogSpots);

  const lookupIds = [...new Set([...sw.likes, ...catalogSpots.map((s) => s.id)])];
  const esById = await fetchSpotsFromEsByIds(lookupIds);
  const embeddingsById = await enrichEmbeddingsForLikes(
    sw,
    catalogSpots,
    esById,
    buildEmbeddingRecordMap(catalogSpots, toEsEmbeddingRecords(esById)),
  );
  const likedEmbeddings = buildLikedEmbeddings(sw, embeddingsById);
  const likesWithEmbedding = countLikesWithEmbedding(sw.likes, embeddingsById);

  const vPrefFromLikes = buildWeightedPreferenceVector(sw.likes, sw.likeWeights, embeddingsById);
  const focusAssessment = assessProfileFocus(profile, {
    preferenceVector: vPrefFromLikes,
    likedEmbeddings,
    catalog: catalogSpots,
    embeddingsById,
    nopedIds: sw.nopes,
  });
  const deepInsight = buildDeepPreferenceInsight(profile, travelMemory, focusAssessment);
  const profileSummary = summarizeProfile(profile, focusAssessment, deepInsight);
  const vPref = vPrefFromLikes ?? new Array(VECTOR_DIMS).fill(0);
  const hasLikedEmbeddings = vPrefFromLikes !== null;

  if (hasLikedEmbeddings && sw.likeWeights) {
    const weightSummary = sw.likes
      .map((id) => `${id}:${resolveLikeWeight(sw.likeWeights?.[id])}`)
      .join(", ");
    console.log(`[personalizedPlan] Like 加重 weights: ${weightSummary}`);
  }

  let vComment = new Array(VECTOR_DIMS).fill(0);
  let hasComment = false;

  if (travelMemory?.trim()) {
    try {
      vComment = await embedText(travelMemory, { taskType: "RETRIEVAL_QUERY" });
      vComment = l2Normalize(vComment);
      hasComment = true;
    } catch (e) {
      console.error("[personalized] travelMemoryのベクトル化エラー:", e);
    }
  }

  let vQuery = new Array(VECTOR_DIMS).fill(0);
  if (hasLikedEmbeddings && hasComment) {
    for (let i = 0; i < VECTOR_DIMS; i++) {
      vQuery[i] = 0.5 * vPref[i] + 0.5 * vComment[i];
    }
    vQuery = l2Normalize(vQuery);
  } else if (hasLikedEmbeddings) {
    vQuery = vPref;
  } else if (hasComment) {
    vQuery = vComment;
  } else {
    vQuery = new Array(VECTOR_DIMS).fill(0.01);
    vQuery = l2Normalize(vQuery);
  }

  const personalizedSearchQuery = buildPersonalizedSearchQuery(
    profileSummary,
    travelMemory,
    deepInsight,
  );

  let rankedAll =
    catalogSpots.length > 0
      ? await rankCatalogByEsCandidates(vQuery, catalogSpots, sw.nopes, personalizedSearchQuery)
      : await searchCandidatesGlobal(vQuery, sw.nopes);

  if (catalogSpots.length > 0) {
    const fallbackRanked = rankCatalogByRules(
      profile,
      travelMemory,
      catalogSpots,
      sw.nopes,
      deepInsight,
    );
    if (rankedAll.length === 0 && fallbackRanked.length > 0) {
      console.log(
        "[personalizedPlan] ESランキングが空のため、ルールベース推薦にフォールバックします",
      );
      rankedAll = fallbackRanked;
    } else {
      rankedAll = rerankWithRuleSignal(rankedAll, fallbackRanked);
    }
  }

  const cohesionLabel =
    focusAssessment.vectorCohesion === null ? "n/a" : focusAssessment.vectorCohesion.toFixed(3);
  console.log(
    `[personalizedPlan] ランキング ${rankedAll.length} 件` +
      (catalogSpots.length > 0
        ? ` (目的地内 ${catalogSpots.length} 件を全評価)`
        : " (ES全件 k-NN)") +
      ` → cache key ${planKey.slice(0, 12)}…` +
      ` / needsRefinement=${focusAssessment.needsRefinement}` +
      ` / vectorCohesion=${cohesionLabel}` +
      ` / likesWithEmbedding=${likesWithEmbedding}/${sw.likes.length}`,
  );

  let result = "";
  const interpretedReason = buildRecommendationReason(
    profile,
    travelMemory,
    focusAssessment,
    deepInsight,
  );
  if (rankedAll.length > 0) {
    result = interpretedReason;
    const introPool = rankedAll
      .slice(0, LLM_INTRO_POOL)
      .map((entry) => toIntroSpot(entry.candidate));
    try {
      const introResult = await runIntro({
        profileSummary,
        travelMemory,
        spots: introPool,
      });
      const llmResult = introResult.result?.trim();
      if (llmResult && !introMentionsSpotNames(llmResult, introPool)) {
        result = llmResult;
      }
    } catch (error) {
      console.error(
        "[personalized] 理由文の LLM 生成に失敗しました。ルールベースの解釈文を使用します:",
        error,
      );
    }
  } else {
    result = "好みに合う観光地が見つかりませんでした。";
  }

  const cached: CachedPlanRank = {
    planKey,
    profileSummary,
    result,
    needsRefinement: focusAssessment.needsRefinement,
    ranked: rankedToCachedItems(rankedAll),
    createdAt: Date.now(),
  };
  setCachedPlanRank(cached);
  return cached;
}

export async function personalizedPlan(
  sw: Swipes,
  travelMemory = "",
  catalog?: Spot[],
  options?: PersonalizedPlanOptions,
): Promise<PersonalizedResult> {
  const { page, limit } = normalizePagination(options);
  const catalogSpots = Array.isArray(catalog) ? catalog : [];
  const planKey =
    options?.planKey?.trim() ||
    buildPlanCacheKey(
      sw,
      travelMemory,
      catalogSpots.map((spot) => spot.id),
    );

  console.log(
    `[personalizedPlan] 開始 (memory: ${travelMemory}, page: ${page}, limit: ${limit}, key: ${planKey.slice(0, 12)}…)`,
  );

  let cachedEntry = getCachedPlanRank(planKey);
  if (page > DEFAULT_PAGE && cachedEntry) {
    console.log(`[personalizedPlan] キャッシュヒット → page ${page} をスライス返却`);
    logRankedScores(cachedEntry.ranked, page, limit, true);
    return sliceCachedPlan(cachedEntry, page, limit);
  }

  if (page > DEFAULT_PAGE && !cachedEntry) {
    console.log("[personalizedPlan] キャッシュミス (page > 1) → フルランキングを再計算");
  }

  cachedEntry = await computeAndCachePlan(sw, travelMemory, catalogSpots, planKey);
  logRankedScores(cachedEntry.ranked, page, limit, false);

  if (cachedEntry.ranked.length === 0) {
    return {
      profileSummary: cachedEntry.profileSummary,
      recommendations: [],
      result: cachedEntry.result,
      needsRefinement: cachedEntry.needsRefinement,
      total: 0,
      page,
      limit,
      planKey,
    };
  }

  return sliceCachedPlan(cachedEntry, page, limit);
}

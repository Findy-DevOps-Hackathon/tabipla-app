import {
  createElasticsearchClient,
  DEFAULT_INDEX_NAME,
  type SpotDocument,
  VECTOR_DIMS,
} from "@tabipla/search-core";
import type { Spot } from "../contracts.js";
import {
  assessProfileFocus,
  buildEmbeddingRecordMap,
  buildLikedEmbeddings,
  buildProfile,
  buildRecommendationReason,
  buildWeightedPreferenceVector,
  resolveLikeWeight,
  type SpotEmbeddingRecord,
  type Swipes,
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
const DEFAULT_LIMIT = 20;
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

/** 正規化済み query と生ベクトルのコサイン類似度。 */
function cosineSimilarity(normalizedQuery: number[], vec: number[]): number {
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

function similarityToScore(similarity: number): number {
  return Math.round(Math.max(0, Math.min(1, similarity)) * 100) / 100;
}

function normalizePagination(options?: PersonalizedPlanOptions): { page: number; limit: number } {
  const page = Math.max(DEFAULT_PAGE, Math.floor(options?.page ?? DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(options?.limit ?? DEFAULT_LIMIT)));
  return { page, limit };
}

async function fetchSpotsFromEsByIds(ids: string[]): Promise<Map<string, EsSpotRecord>> {
  if (ids.length === 0) return new Map();
  const es = createElasticsearchClient();
  try {
    const res = await es.search({
      index: DEFAULT_INDEX_NAME,
      size: ids.length,
      query: { ids: { values: ids } },
    });

    const map = new Map<string, EsSpotRecord>();
    for (const h of res.hits.hits) {
      const id = h._id;
      if (!id) continue;
      map.set(id, { id, ...(h._source as Record<string, unknown>) });
    }
    return map;
  } catch (e) {
    console.error("[personalized] fetchSpotsFromEsByIdsエラー:", e);
    return new Map();
  }
}

/** 目的地カタログ内のスポットを ES kNN でランキングする（_source.embedding 非依存）。 */
async function rankCatalogByKnn(
  queryVector: number[],
  catalogSpots: Spot[],
  excludeIds: string[],
): Promise<RankedCandidate[]> {
  const exclude = new Set(excludeIds);
  const targetSpots = catalogSpots.filter((spot) => !exclude.has(spot.id));
  if (targetSpots.length === 0) return [];

  const catalogIds = targetSpots.map((spot) => spot.id);
  const k = catalogIds.length;
  const es = createElasticsearchClient();

  try {
    const res = await es.search({
      index: DEFAULT_INDEX_NAME,
      knn: {
        field: "embedding",
        query_vector: queryVector,
        k,
        num_candidates: Math.max(50, k * 2),
        filter: {
          bool: {
            filter: [{ ids: { values: catalogIds } }],
          },
        },
      },
      size: k,
    });

    const esById = new Map<string, EsSpotRecord>();
    for (const h of res.hits.hits) {
      const id = h._id;
      if (!id) continue;
      esById.set(id, { id, ...(h._source as Record<string, unknown>) });
    }

    const catalogById = new Map(targetSpots.map((spot) => [spot.id, spot]));
    const ranked: RankedCandidate[] = [];

    for (const [index, h] of res.hits.hits.entries()) {
      const id = h._id;
      if (!id) continue;
      const catalogSpot = catalogById.get(id);
      if (!catalogSpot) continue;
      ranked.push({
        candidate: mergeCatalogSpot(catalogSpot, esById.get(id)),
        similarity: typeof h._score === "number" ? h._score : Math.max(0, 1 - index * 0.05),
      });
    }

    return ranked;
  } catch (e) {
    console.error("[personalized] rankCatalogByKnnエラー:", e);
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
    location: catalogSpot.location ?? es?.location,
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
    location: cand.location as SpotDocument["location"],
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
  const embeddingsById = buildEmbeddingRecordMap(catalogSpots, toEsEmbeddingRecords(esById));

  const vPrefFromLikes = buildWeightedPreferenceVector(sw.likes, sw.likeWeights, embeddingsById);
  const focusAssessment = assessProfileFocus(profile, {
    preferenceVector: vPrefFromLikes,
    likedEmbeddings: buildLikedEmbeddings(sw, embeddingsById),
    catalog: catalogSpots,
    embeddingsById,
    nopedIds: sw.nopes,
  });
  const profileSummary = summarizeProfile(profile, focusAssessment);
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

  const rankedAll =
    catalogSpots.length > 0
      ? await rankCatalogByKnn(vQuery, catalogSpots, sw.nopes)
      : await searchCandidatesGlobal(vQuery, sw.nopes);

  console.log(
    `[personalizedPlan] ランキング ${rankedAll.length} 件` +
      (catalogSpots.length > 0
        ? ` (目的地内 ${catalogSpots.length} 件を全評価)`
        : " (ES全件 k-NN)") +
      ` → cache key ${planKey.slice(0, 12)}…` +
      ` / needsRefinement=${focusAssessment.needsRefinement}` +
      (focusAssessment.vectorCohesion !== null
        ? ` / vectorCohesion=${focusAssessment.vectorCohesion.toFixed(3)}`
        : ""),
  );

  let result = "";
  const interpretedReason = buildRecommendationReason(profile, travelMemory, focusAssessment);
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

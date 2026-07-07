import { createElasticsearchClient } from "@tabipla/search-core";
import { embedText } from "./embedding.js";
import { runRerank, type PlanItemEntry } from "./rerank.js";
import { buildProfile, summarizeProfile, userProfiles, type Swipes } from "../personalize.js";

export interface Recommendation {
  id: string;
  name: string;
  category: string;
  priceLevel: number;
  tags: string[];
  image: string;
  score: number;
  why?: string[]; // 下位互換用
}

export interface PlanItem {
  type: "spot" | "break";
  timeSlot: string;
  spot?: Recommendation;
  title: string;
  description: string;
}

export interface PersonalizedResult {
  profileSummary: string;
  plan: PlanItem[]; // タイムライン旅程（巡る順）
  recommendations: Recommendation[]; // その他のサブおすすめ（お勧め順）
  result: string; // 推薦の要約テキスト
}

// L2正規化
function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    return vec.map((v) => v / norm);
  }
  return vec;
}

/**
 * ESから指定されたIDリストのドキュメントを取得し、embeddingベクトルを取り出す
 */
async function fetchEmbeddingsForIds(ids: string[]): Promise<number[][]> {
  if (ids.length === 0) return [];
  const es = createElasticsearchClient();
  try {
    const res = await es.search({
      index: "spots",
      size: ids.length,
      query: {
        ids: { values: ids },
      },
    });

    const hits = res.hits.hits;
    const embs: number[][] = [];
    for (const h of hits) {
      const src = h._source as { embedding?: number[] };
      if (src?.embedding && src.embedding.length > 0) {
        embs.push(src.embedding);
      }
    }
    return embs;
  } catch (e) {
    console.error("[personalized] fetchEmbeddingsForIdsエラー:", e);
    return [];
  }
}

/**
 * 地理的近傍 (k-NN) 検索を実行
 */
async function searchCandidates(
  queryVector: number[],
  excludeIds: string[],
  lat: number,
  lon: number,
): Promise<any[]> {
  const es = createElasticsearchClient();
  try {
    const mustNotFilters: any[] = [];
    if (excludeIds.length > 0) {
      mustNotFilters.push({ ids: { values: excludeIds } });
    }

    const knn: any = {
      field: "embedding",
      query_vector: queryVector,
      k: 15,
      num_candidates: 50,
      filter: {
        bool: {
          must: [
            {
              geo_distance: {
                distance: "15km",
                location: { lat, lon },
              },
            },
          ],
          must_not: mustNotFilters,
        },
      },
    };

    const res = await es.search({
      index: "spots",
      knn,
      size: 15,
    });

    return res.hits.hits.map((h) => ({
      id: h._id,
      ...(h._source as any),
    }));
  } catch (e) {
    console.error("[personalized] searchCandidatesエラー:", e);
    return [];
  }
}

export async function personalizedPlan(
  sw: Swipes,
  userId = "demo",
  timeBudget = "半日",
  origin = "小諸駅",
  travelMemory = "",
  catalog?: any,
): Promise<PersonalizedResult> {
  console.log(`[personalizedPlan] 開始 (userId: ${userId}, origin: ${origin}, memory: ${travelMemory})`);

  // 1. スワイプ履歴から簡易プロファイルを構築 (画面上でのサマリー表示用)
  const profile = buildProfile(sw, []);
  const existing = userProfiles.get(userId);
  if (existing) {
    profile.feedbackNotes = existing.feedbackNotes;
    profile.introStyle = existing.introStyle;
  }
  userProfiles.set(userId, profile);

  const profileSummary = summarizeProfile(profile);

  // 2. likes の embedding を取得し、平均化 (ユーザーの嗜好ベクトル v_pref)
  const likedEmbeddings = await fetchEmbeddingsForIds(sw.likes);
  let vPref = new Array(1536).fill(0);

  if (likedEmbeddings.length > 0) {
    for (const emb of likedEmbeddings) {
      for (let i = 0; i < 1536; i++) {
        vPref[i] += emb[i] ?? 0;
      }
    }
    vPref = vPref.map((v) => v / likedEmbeddings.length);
    vPref = l2Normalize(vPref);
  }

  // 3. travelMemory のベクトル化 (思い出文脈ベクトル v_comment)
  let vComment = new Array(1536).fill(0);
  let hasComment = false;

  if (travelMemory && travelMemory.trim()) {
    try {
      vComment = await embedText(travelMemory, { taskType: "RETRIEVAL_QUERY" });
      vComment = l2Normalize(vComment);
      hasComment = true;
    } catch (e) {
      console.error("[personalized] travelMemoryのベクトル化エラー:", e);
    }
  }

  // 4. 嗜好ベクトル と 思い出文脈ベクトル の統合 (v_query)
  let vQuery = new Array(1536).fill(0);
  if (likedEmbeddings.length > 0 && hasComment) {
    for (let i = 0; i < 1536; i++) {
      vQuery[i] = 0.5 * vPref[i] + 0.5 * vComment[i];
    }
    vQuery = l2Normalize(vQuery);
  } else if (likedEmbeddings.length > 0) {
    vQuery = vPref;
  } else if (hasComment) {
    vQuery = vComment;
  } else {
    vQuery = new Array(1536).fill(0.01);
  }

  // 5. 物理制約 (小諸周辺) フィルター付き ES 近傍 (k-NN) 検索
  const lat = 36.3268;
  const lon = 138.4211;
  const rawCandidates = await searchCandidates(vQuery, sw.nopes, lat, lon);

  console.log(`[personalizedPlan] ESヒット件数: ${rawCandidates.length}`);

  // もしESから候補が見つからない場合は、フォールバックとして空配列を返却
  if (rawCandidates.length === 0) {
    return {
      profileSummary,
      plan: [],
      recommendations: [],
      result: "指定されたエリアで時間・好みに合う観光地が見つかりませんでした。",
    };
  }

  // 6. 120点アテンド協調プランナーの実行 (Storyteller, Concierge, Route Planner)
  const rerankInput = {
    profileSummary,
    travelMemory,
    timeBudget,
    origin,
    spots: rawCandidates,
  };

  let attendResult: {
    planItems: PlanItemEntry[];
    result: string;
    subRecommendations: string[];
  };

  try {
    attendResult = await runRerank(rerankInput);
  } catch (error) {
    console.error("[personalized] プラン生成に失敗しました。フォールバックします:", error);
    attendResult = {
      planItems: rawCandidates.slice(0, 3).map((c, idx) => ({
        type: "spot",
        timeSlot: idx === 0 ? "10:00 - 11:30" : idx === 1 ? "12:00 - 13:00" : "14:00 - 15:30",
        spotId: c.id,
        title: c.name,
        description: c.description || "おすすめのスポットです。",
      })),
      result: `${rawCandidates.slice(0, 3).map((c) => c.name).join("、")}を巡るおすすめプランです。`,
      subRecommendations: rawCandidates.slice(3, 9).map((c) => c.id),
    };
  }

  // デフォルト画像アセット
  const UNSPLASH_IMAGES = [
    "https://images.unsplash.com/photo-1542044896530-05d85be9b11a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80",
  ];

  // タイムライン旅程プラン (planItems) のマッピング
  const plan: PlanItem[] = attendResult.planItems
    .map((item) => {
      if (item.type === "spot" && item.spotId) {
        const cand = rawCandidates.find((c) => c.id === item.spotId);
        if (cand) {
          return {
            type: "spot" as const,
            timeSlot: item.timeSlot,
            title: item.title,
            description: item.description,
            spot: {
              id: cand.id,
              name: cand.name,
              category: Array.isArray(cand.category) ? cand.category[0] || "観光" : cand.category || "観光",
              priceLevel: cand.priceLevel || cand.price || 0,
              tags: cand.tags || [],
              image: cand.imageUrl || cand.image || UNSPLASH_IMAGES[Math.floor(Math.random() * UNSPLASH_IMAGES.length)],
              score: 10,
            },
          };
        }
      }
      return {
        type: "break" as const,
        timeSlot: item.timeSlot,
        title: item.title,
        description: item.description,
      };
    });

  // サブおすすめリスト (recommendations) のマッピング
  const subRecommendations: Recommendation[] = attendResult.subRecommendations
    .map((subId) => {
      const cand = rawCandidates.find((c) => c.id === subId);
      if (cand) {
        return {
          id: cand.id,
          name: cand.name,
          category: Array.isArray(cand.category) ? cand.category[0] || "観光" : cand.category || "観光",
          priceLevel: cand.priceLevel || cand.price || 0,
          tags: cand.tags || [],
          image: cand.imageUrl || cand.image || UNSPLASH_IMAGES[Math.floor(Math.random() * UNSPLASH_IMAGES.length)],
          score: 9,
        };
      }
      return null;
    })
    .filter((x): x is Recommendation => x !== null);

  return {
    profileSummary,
    plan,
    recommendations: subRecommendations,
    result: attendResult.result || "おすすめの旅行プランです。",
  };
}

import { createElasticsearchClient } from "@tabipla/search-core";
import { embedText } from "./embedding.js";
import { runRerank, type RerankScoreEntry } from "./rerank.js";
import { buildProfile, summarizeProfile, userProfiles, type Swipes } from "../personalize.js";
import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";

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

export interface PersonalizedResult {
  profileSummary: string;
  recommendations: Recommendation[]; // 好み学習による並べ替え（表示用）
  result: string; // 推薦の要約テキスト
}

// 推薦サマリー文章を作成するLLMエージェント
const summaryAgent = new LlmAgent({
  name: "summary_agent",
  model: "gemini-2.5-flash",
  description: "最終的な推薦プランの要約作成",
  instruction: `あなたは親切な旅行プランナーです。
提示された「ユーザーの好み」「思い出コメント」「おすすめされた観光地リスト」をもとに、
今回の旅のテーマや全体的な見どころを盛り込んだ、ユーザーをワクワクさせるような簡潔な旅程のまとめ文（150文字〜250文字程度）を作成してください。
※ 個別の観光スポットの長々とした説明や、「なぜこのスポットを選んだか（Why）」という詳細な理由は含めず、全体のストーリーやテーマ性に焦点を当ててください。`,
});

/**
 * ESから指定されたIDリストのドキュメントを取得し、embeddingベクトルを取り出す
 */
async function fetchEmbeddingsForIds(ids: string[]): Promise<number[][]> {
  if (ids.length === 0) return [];
  const es = createElasticsearchClient();
  try {
    const esResponse = await es.search<any>({
      index: "spots",
      size: ids.length,
      query: {
        ids: {
          values: ids,
        },
      },
    });
    return esResponse.hits.hits
      .map((h) => h._source?.embedding)
      .filter((v): v is number[] => Array.isArray(v));
  } catch (error) {
    console.error("[personalized] ESベクトルの取得に失敗しました:", error);
    return [];
  } finally {
    await es.close();
  }
}

/**
 * 物理制約 (geo_distance) フィルター付きの近傍 (k-NN) 検索を実行する
 * - 基準スポット(ref-*)およびnopedのIDは除外します。
 */
async function searchCandidates(
  queryVector: number[],
  nopedIds: string[],
  lat: number,
  lon: number,
): Promise<any[]> {
  const es = createElasticsearchClient();
  const nopedSet = new Set(nopedIds);
  try {
    const esResponse = await es.search<any>({
      index: "spots",
      size: 15,
      knn: {
        field: "embedding",
        query_vector: queryVector,
        k: 15,
        num_candidates: 50,
        filter: {
          geo_distance: {
            distance: "15km",
            location: { lat, lon },
          },
        },
      },
    });

    return esResponse.hits.hits
      .map((h) => h._source)
      .filter((doc) => doc && !nopedSet.has(doc.id) && !doc.id.startsWith("ref-"));
  } catch (error) {
    console.error("[personalized] ES近傍検索に失敗しました:", error);
    return [];
  } finally {
    await es.close();
  }
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

export async function personalizedPlan(
  sw: Swipes,
  userId = "demo",
  timeBudget = "4時間",
  origin = "小諸駅",
  travelMemory = "",
  catalog?: any,
): Promise<PersonalizedResult> {
  console.log(`[personalizedPlan] 開始 (userId: ${userId}, origin: ${origin}, memory: ${travelMemory})`);

  // 1. スワイプ履歴から簡易プロファイルを構築 (画面上でのサマリー表示用)
  // fixtureの依存を排除するため、カタログがなくても動くようにダミー配列を渡す
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
    // どちらもない場合はデフォルトの全ゼロ (または乱数)
    vQuery = new Array(1536).fill(0.01);
  }

  // 5. 物理制約 (小諸周辺) フィルター付き ES 近傍 (k-NN) 検索
  // 出発地 origin が小諸周辺であると仮定し、座標を設定
  // (本番は origin の名称からジオコーディングを行いますが、デモでは小諸駅基準に固定)
  const lat = 36.3268;
  const lon = 138.4211;
  const rawCandidates = await searchCandidates(vQuery, sw.nopes, lat, lon);

  console.log(`[personalizedPlan] ESヒット件数: ${rawCandidates.length}`);

  // もしESから候補が見つからない場合は、フォールバックとして空配列を返却
  if (rawCandidates.length === 0) {
    return {
      profileSummary,
      recommendations: [],
      result: "指定されたエリアで時間・好みに合う観光地が見つかりませんでした。",
    };
  }

  // 6. アンサンブル・リランキングの実行 (Desire & Reality の 2つのLLM評価器)
  const rerankInput = {
    profileSummary,
    travelMemory,
    timeBudget,
    origin,
    spots: rawCandidates,
  };

  let rerankScores: RerankScoreEntry[] = [];
  try {
    rerankScores = await runRerank(rerankInput);
  } catch (error) {
    console.error("[personalized] リランキングに失敗しました。ESスコアで代替します:", error);
    // パラバック: LLMが落ちた場合は単純なインデックス順
    rerankScores = rawCandidates.map((c, idx) => ({
      id: c.id,
      desireScore: 5,
      realityScore: 5,
      finalScore: 10 - idx,
    }));
  }

  // リランキング結果に沿ってスポットの順序を整え、フロントエンド返却用にマッピング
  const orderedRecommendations: Recommendation[] = [];
  // プレミアムな体験のため、デフォルト画像を Unsplash から割り当て
  const UNSPLASH_IMAGES = [
    "https://images.unsplash.com/photo-1542044896530-05d85be9b11a?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80",
  ];

  for (const scoreEntry of rerankScores) {
    const cand = rawCandidates.find((c) => c.id === scoreEntry.id);
    if (cand) {
      orderedRecommendations.push({
        id: cand.id,
        name: cand.name,
        category: Array.isArray(cand.category) ? cand.category[0] || "観光" : cand.category || "観光",
        priceLevel: cand.priceLevel || cand.price || 0,
        tags: cand.tags || [],
        // fixture または Unsplash から画像アセットを設定
        image: cand.image || UNSPLASH_IMAGES[orderedRecommendations.length % UNSPLASH_IMAGES.length],
        score: scoreEntry.finalScore,
      });
    }
  }

  // 7. 最終要約の生成 (1回のみのLLM呼び出し)
  const spotsListText = orderedRecommendations.map((r) => `- ${r.name} (${r.category})`).join("\n");
  const summaryPrompt = `
【ユーザーの好み】
${profileSummary}

【思い出コメント】
${travelMemory || "特になし"}

【提案されたおすすめスポット】
${spotsListText}
  `;

  let summaryText = "";
  try {
    const runner = new InMemoryRunner({ agent: summaryAgent });
    const session = await runner.sessionService.createSession({
      appName: runner.appName,
      userId: "summarizer",
    });

    let final = "";
    for await (const event of runner.runAsync({
      userId: "summarizer",
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: summaryPrompt }] },
    })) {
      const t = stringifyContent(event).trim();
      if (t) final = t;
    }
    summaryText = final;
  } catch (error) {
    console.error("[personalized] サマリーの生成に失敗しました:", error);
    summaryText = `${orderedRecommendations.map((r) => r.name).join("、")}を巡るおすすめプランです。`;
  }

  return {
    profileSummary,
    recommendations: orderedRecommendations,
    result: summaryText,
  };
}

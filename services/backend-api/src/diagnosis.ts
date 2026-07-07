import { createDatabase, listSpots } from "@tabipla/db";
import { createElasticsearchClient, type SpotDocument } from "@tabipla/search-core";
import { toSpotDocument } from "./mapper.js";

// 内積によるコサイン類似度計算 (L2正規化されている前提ですが、安全のために正規化も含めます)
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type DiagnosisSpot = SpotDocument & {
  clusterId?: number;
};

export type NextPairRequest = {
  likes: string[];
  nopes: string[];
};

export type NextPairResponse = {
  spotA: DiagnosisSpot | null;
  spotB: DiagnosisSpot | null;
  isComplete: boolean;
  roundIndex: number;
};

// 基準となるクラスタ代表点 (直交サンプリング用)
// 6つのクラスタ（0〜5）から、代表的なスポットをペアにして提示
// 第1ラウンド: クラスタ0 (歴史定番) vs クラスタ1 (大自然)
// 第2ラウンド: クラスタ2 (屋内/アクティビティ) vs クラスタ3 (グルメ)
const REPRESENTATIVE_PAIRS = [
  { a: "ref-01", b: "ref-11" }, // クラスタ0 (清水寺) vs クラスタ1 (上高地)
  { a: "ref-18", b: "ref-26" }, // クラスタ2 (美ら海水族館) vs クラスタ3 (横浜中華街)
];

/**
 * ESおよびDBから、embeddingとclusterIdを含んだ基準スポット(50件)のマップを取得する
 */
async function fetchReferenceSpotsMap(): Promise<
  Map<string, DiagnosisSpot & { embedding: number[] }>
> {
  const db = createDatabase();
  const es = createElasticsearchClient();
  const map = new Map<string, DiagnosisSpot & { embedding: number[] }>();

  try {
    // 1. DBから ref- で始まるスポットを取得 (clusterId を取得するため)
    const { rows } = await listSpots(db, { limit: 100, prefecture: undefined });
    const refRows = rows.filter((r) => r.id.startsWith("ref-"));

    // 2. ESから同じIDのドキュメントを検索 (embedding ベクトルを取得するため)
    const ids = refRows.map((r) => r.id);
    const indexName = process.env.ES_INDEX ?? "spots";
    const esResponse = await es.search<SpotDocument>({
      index: indexName,
      size: 100,
      query: {
        ids: {
          values: ids,
        },
      },
    });
    const esDocs = esResponse.hits.hits;

    for (const row of refRows) {
      const hit = esDocs.find((h) => h._id === row.id);
      if (hit?._source?.embedding) {
        map.set(row.id, {
          ...toSpotDocument(row),
          embedding: hit._source.embedding,
        });
      }
    }
  } finally {
    await db.$client.end();
    await es.close();
  }

  return map;
}

/**
 * 次に提示するA/Bテストのペアを決定する
 */
export async function getNextPair(req: NextPairRequest): Promise<NextPairResponse> {
  const likesSet = new Set(req.likes);
  const swipedSet = new Set([...req.likes, ...req.nopes]);

  // すでに何ラウンド進んだか (選択した回数 = ラウンドインデックス)
  const roundIndex = likesSet.size;

  // 10ラウンド完了、または提示するペアが無くなったら終了
  if (roundIndex >= 10) {
    return { spotA: null, spotB: null, isComplete: true, roundIndex };
  }

  // 基準観光地の全データをロード
  const refSpotsMap = await fetchReferenceSpotsMap();

  if (refSpotsMap.size === 0) {
    throw new Error(
      "[diagnosis] 基準観光地データがロードできませんでした。シードとクラスタリングを先に実行してください。",
    );
  }

  // --- 前半：第1〜2ラウンド (直交サンプリング) ---
  if (roundIndex < REPRESENTATIVE_PAIRS.length) {
    const pairConfig = REPRESENTATIVE_PAIRS[roundIndex];
    if (pairConfig) {
      const spotA = refSpotsMap.get(pairConfig.a) ?? null;
      const spotB = refSpotsMap.get(pairConfig.b) ?? null;
      if (spotA && spotB) {
        return {
          spotA: { ...spotA, embedding: undefined }, // フロントにベクトルは送らない
          spotB: { ...spotB, embedding: undefined },
          isComplete: false,
          roundIndex,
        };
      }
    }
  }

  // --- 後半：第3ラウンド以降 (能動学習 - Active Learning) ---
  // 1. ユーザーの選好方向ベクトル w の算出
  let cLike = new Array(1536).fill(0);
  let cNope = new Array(1536).fill(0);
  let likeCount = 0;
  let nopeCount = 0;

  for (const id of req.likes) {
    const spot = refSpotsMap.get(id);
    if (spot) {
      likeCount++;
      for (let i = 0; i < 1536; i++) cLike[i] += spot.embedding[i] ?? 0;
    }
  }

  for (const id of req.nopes) {
    const spot = refSpotsMap.get(id);
    if (spot) {
      nopeCount++;
      for (let i = 0; i < 1536; i++) cNope[i] += spot.embedding[i] ?? 0;
    }
  }

  // 平均ベクトルの計算
  if (likeCount > 0) cLike = cLike.map((v) => v / likeCount);
  if (nopeCount > 0) cNope = cNope.map((v) => v / nopeCount);

  // 選好方向ベクトル w = cLike - cNope
  const w = new Array(1536).fill(0);
  for (let i = 0; i < 1536; i++) {
    w[i] = cLike[i] - cNope[i];
  }

  // 2. 未評価スポットとの類似度計算
  const candidates: { id: string; similarity: number }[] = [];
  for (const [id, spot] of refSpotsMap.entries()) {
    if (!swipedSet.has(id)) {
      const sim = cosineSimilarity(spot.embedding, w);
      candidates.push({ id, similarity: sim });
    }
  }

  if (candidates.length < 2) {
    return { spotA: null, spotB: null, isComplete: true, roundIndex };
  }

  // 3. 境界線サンプリング (コサイン類似度 S_i = 0 に最も近いものを対比させて提示)
  // S_i > 0 の中で最も 0 に近い（絶対値が最小の）1件と、
  // S_i < 0 の中で最も 0 に近い（絶対値が最小の）1件を選定
  let bestLikeCandidate: (typeof candidates)[0] | null = null;
  let bestNopeCandidate: (typeof candidates)[0] | null = null;

  for (const cand of candidates) {
    if (cand.similarity >= 0) {
      if (!bestLikeCandidate || cand.similarity < bestLikeCandidate.similarity) {
        bestLikeCandidate = cand;
      }
    } else {
      if (!bestNopeCandidate || cand.similarity > bestNopeCandidate.similarity) {
        bestNopeCandidate = cand;
      }
    }
  }

  let spotAId: string | null = null;
  let spotBId: string | null = null;

  if (bestLikeCandidate && bestNopeCandidate) {
    spotAId = bestLikeCandidate.id;
    spotBId = bestNopeCandidate.id;
  } else {
    // どちらか片側に偏っている場合は、単純に絶対値類似度が 0 に近い上位2件を選択
    candidates.sort((a, b) => Math.abs(a.similarity) - Math.abs(b.similarity));
    spotAId = candidates[0]?.id ?? null;
    spotBId = candidates[1]?.id ?? null;
  }

  const spotA = spotAId ? (refSpotsMap.get(spotAId) ?? null) : null;
  const spotB = spotBId ? (refSpotsMap.get(spotBId) ?? null) : null;

  return {
    spotA: spotA ? { ...spotA, embedding: undefined } : null,
    spotB: spotB ? { ...spotB, embedding: undefined } : null,
    isComplete: spotA === null || spotB === null,
    roundIndex,
  };
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, upsertSpots } from "@tabipla/db";
import { bulkIndexDocuments, createElasticsearchClient, ensureIndex } from "@tabipla/search-core";
import { kmeans } from "ml-kmeans";
import { buildSpotEmbedText, embedText, resolveEmbeddingProvider } from "./embedding.js";
import { toSpotDocument } from "./mapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. 基準サンプル観光地 JSON (50件) を読み込む
const jsonPath = path.resolve(__dirname, "../../../packages/db/src/reference-spots.json");
if (!fs.existsSync(jsonPath)) {
  console.error(`[cluster-reference-spots] reference-spots.json が見つかりません: ${jsonPath}`);
  process.exit(1);
}

const rawData = fs.readFileSync(jsonPath, "utf-8");
const spotsData = JSON.parse(rawData) as any[];

async function main() {
  console.log(`[cluster-reference-spots] 基準観光地データ ${spotsData.length} 件を読み込みました。`);

  const db = createDatabase();
  const es = createElasticsearchClient();
  const provider = resolveEmbeddingProvider();

  console.log(`[cluster-reference-spots] embedding プロバイダ: ${provider}`);

  try {
    // A. データベース (PostgreSQL) へシード投入
    // 自治体IDはデフォルトで 'mun-komoro' を使用
    const dbInput = spotsData.map((s) => ({
      id: s.id,
      municipalityId: "mun-komoro",
      name: s.name,
      description: s.description,
      category: s.category,
      area: s.area,
      prefecture: s.prefecture,
      address: s.address,
      tags: s.tags,
      lat: s.lat,
      lon: s.lon,
      price: s.price,
      sensoryScores: s.sensoryScores,
    }));

    console.log("[cluster-reference-spots] PostgreSQL へシード投入を開始します...");
    const savedRows = await upsertSpots(db, dbInput);
    console.log(`[cluster-reference-spots] PostgreSQL へ ${savedRows.length} 件を upsert しました。`);

    // B. 特性ベクトルの生成と9次元特徴ベクトルの構築
    console.log("[cluster-reference-spots] 各スポットの特性ベクトル (embeddings) を生成し、9次元特徴ベクトルを構築します...");
    const docList = [];
    const vectors: number[][] = [];
    const embeddings: number[][] = [];

    for (const row of savedRows) {
      const baseDoc = toSpotDocument(row);
      const text = buildSpotEmbedText(baseDoc);
      const embedding = await embedText(text, {
        taskType: "RETRIEVAL_DOCUMENT",
      });
      docList.push({ baseDoc, embedding });
      embeddings.push(embedding);

      // reference-spots.json に登録されている sensoryScores から9次元の特徴ベクトルを構築
      const s = spotsData.find((x) => x.id === row.id);
      const scores = s?.sensoryScores || {
        nature: 0.1, history: 0.1, art: 0.1, entertainment: 0.1, gourmet: 0.1,
        activity: 0.1, quietness: 0.3, indoor: 0.1, popularity: 0.4
      };
      vectors.push([
        scores.nature,
        scores.history,
        scores.art,
        scores.entertainment,
        scores.gourmet,
        scores.activity,
        scores.quietness,
        scores.indoor,
        scores.popularity,
      ]);
    }

    // C. K-Means によるクラスタリングの実行 (K = 6)
    console.log("[cluster-reference-spots] K-Means (K=6) を実行して事前クラスタリングを行います...");
    const k = 6;
    const ans = kmeans(vectors, k, {
      seed: 42, // 再現性のためにシード値を固定
      maxIterations: 100,
    });

    console.log("[cluster-reference-spots] 各クラスタの割り当て結果:");
    const clusterCounts = new Array(k).fill(0);
    for (const clusterId of ans.clusters) {
      clusterCounts[clusterId]++;
    }
    for (let i = 0; i < k; i++) {
      console.log(`  - クラスタ ${i}: ${clusterCounts[i]} 件`);
    }

    // D. データベース (PostgreSQL) への cluster_id 保存
    console.log("[cluster-reference-spots] PostgreSQL へ cluster_id の保存を開始します...");
    const dbUpdateInput = savedRows.map((row, idx) => ({
      id: row.id,
      municipalityId: row.municipalityId,
      name: row.name,
      description: row.description,
      category: row.category,
      area: row.area,
      prefecture: row.prefecture,
      address: row.address,
      tags: row.tags,
      lat: row.lat,
      lon: row.lon,
      price: row.price,
      sensoryScores: row.sensoryScores,
      clusterId: ans.clusters[idx], // クラスタIDを付与
    }));

    const finalRows = await upsertSpots(db, dbUpdateInput);
    console.log(`[cluster-reference-spots] PostgreSQL へ cluster_id 付きで ${finalRows.length} 件を更新しました。`);

    // E. Elasticsearch への同期 (cluster_id と embedding を含む)
    console.log("[cluster-reference-spots] Elasticsearch へ同期中...");
    const { index } = await ensureIndex(es);

    // ESへ渡すドキュメントを構築
    const esDocuments = finalRows.map((row, idx) => {
      const doc = toSpotDocument(row);
      return {
        ...doc,
        cluster_id: row.clusterId,
        clusterId: row.clusterId,
        embedding: embeddings[idx],
        sensoryScores: row.sensoryScores,
      };
    });

    const esResult = await bulkIndexDocuments(es, esDocuments as any, { index });
    await es.indices.refresh({ index });

    console.log(`[cluster-reference-spots] 完了: ${esResult.count} 件の基準観光地を Elasticsearch に投入しました。`);

  } catch (error) {
    console.error("[cluster-reference-spots] エラーが発生しました:", error);
    process.exitCode = 1;
  } finally {
    await db.$client.end();
    await es.close();
  }
}

main();

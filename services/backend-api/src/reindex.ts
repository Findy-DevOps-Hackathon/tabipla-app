import { createDatabase, iterateAllSpots } from "@tabipla/db";
import {
  bulkIndexDocuments,
  createElasticsearchClient,
  ensureIndex,
} from "@tabipla/search-core";
import { toSpotDocument } from "./mapper.js";

/**
 * reindex: PostgreSQL（正本）→ Elasticsearch（検索用の写し）への一方向同期。
 *
 *   pnpm -C services/backend-api reindex
 *
 * 環境変数:
 *   - DATABASE_URL: PostgreSQL 接続先（@tabipla/db が解決）
 *   - ES_NODE など: Elasticsearch 接続先（@tabipla/search-core が解決）
 *   - REINDEX_BATCH_SIZE: 1バッチあたりの件数（既定 500）
 *
 * 方針:
 *   - backend-api は ES へ直接アクセスせず、必ず search-core を経由する。
 *   - DB の正本データを id 昇順にバッチ取得し、bulk で投入する（冪等。id が一致すれば上書き）。
 *   - embedding（ベクトル）はここでは投入しない。生成は RAG パイプライン側（別タスク）。
 */

const DEFAULT_BATCH_SIZE = 500;

function resolveBatchSize(): number {
  const raw = process.env.REINDEX_BATCH_SIZE;
  if (!raw) return DEFAULT_BATCH_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `REINDEX_BATCH_SIZE には正の整数を指定してください。受け取った値: "${raw}"`,
    );
  }
  return parsed;
}

async function main(): Promise<void> {
  const batchSize = resolveBatchSize();
  const db = createDatabase();
  const es = createElasticsearchClient();

  let total = 0;
  let hadErrors = false;

  try {
    const { index, created } = await ensureIndex(es);
    console.log(
      `[reindex] index "${index}" を使用します（${created ? "新規作成" : "既存"}）。`,
    );

    for await (const batch of iterateAllSpots(db, batchSize)) {
      const documents = batch.map(toSpotDocument);
      const result = await bulkIndexDocuments(es, documents, { index });
      total += result.count;
      if (result.errors) {
        hadErrors = true;
        console.warn(
          `[reindex] バッチ投入で一部エラーがありました（${result.count} 件中）。`,
        );
      }
      console.log(`[reindex] ${total} 件まで投入しました。`);
    }

    // バッチ投入では refresh していないため、最後にまとめて可視化する。
    await es.indices.refresh({ index });

    console.log(
      `[reindex] 完了: 合計 ${total} 件を Elasticsearch に投入しました。${
        hadErrors ? "（一部エラーあり）" : ""
      }`,
    );
  } finally {
    await db.$client.end();
    await es.close();
  }

  if (hadErrors) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[reindex] 失敗しました:", error);
  process.exit(1);
});

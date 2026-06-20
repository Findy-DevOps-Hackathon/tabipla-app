import { createDatabase, iterateAllSpots } from "@tabipla/db";
import { bulkIndexDocuments, createElasticsearchClient, ensureIndex } from "@tabipla/search-core";
import { buildSpotEmbedText, embedText, resolveEmbeddingProvider } from "./embedding.js";
import { toSpotDocument } from "./mapper.js";

/**
 * embed-spots: PostgreSQL（正本）の全スポットに embedding を付与して Elasticsearch へ投入する。
 *
 *   pnpm -C services/backend-api embed-spots
 *
 * 前提:
 *   - reindex 相当の DB → ES 同期後、または seed 投入後に実行する。
 *   - embedding 生成は backend-api 側（Gemini Embeddings / hash フォールバック）。
 *
 * 環境変数:
 *   - DATABASE_URL, ES_NODE など（reindex と同様）
 *   - GEMINI_API_KEY, EMBEDDING_PROVIDER（reindex と同様）
 *   - EMBED_BATCH_SIZE: 1バッチあたりの件数（既定 50）
 */

const DEFAULT_BATCH_SIZE = 50;

function resolveBatchSize(): number {
  const raw = process.env.EMBED_BATCH_SIZE;
  if (!raw) return DEFAULT_BATCH_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`EMBED_BATCH_SIZE には正の整数を指定してください。受け取った値: "${raw}"`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const batchSize = resolveBatchSize();
  const provider = resolveEmbeddingProvider();
  const db = createDatabase();
  const es = createElasticsearchClient();

  let total = 0;
  let hadErrors = false;

  console.log(
    `[embed-spots] embedding プロバイダ: ${provider}${
      provider === "hash" ? "（意味的類似度は限定的）" : ""
    }`,
  );

  try {
    const { index, created } = await ensureIndex(es);
    console.log(
      `[embed-spots] index "${index}" を使用します（${created ? "新規作成" : "既存"}）。`,
    );

    for await (const batch of iterateAllSpots(db, batchSize)) {
      const documents = [];
      for (const row of batch) {
        const base = toSpotDocument(row);
        const text = buildSpotEmbedText(base);
        const embedding = await embedText(text, {
          taskType: "RETRIEVAL_DOCUMENT",
        });
        documents.push({ ...base, embedding });
      }

      const result = await bulkIndexDocuments(es, documents, { index });
      total += result.count;
      if (result.errors) {
        hadErrors = true;
        console.warn(`[embed-spots] バッチ投入で一部エラーがありました（${result.count} 件中）。`);
      }
      console.log(`[embed-spots] ${total} 件まで embedding 付きで投入しました。`);
    }

    await es.indices.refresh({ index });

    console.log(
      `[embed-spots] 完了: 合計 ${total} 件を embedding 付きで Elasticsearch に投入しました。${
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
  console.error("[embed-spots] 失敗しました:", error);
  process.exit(1);
});

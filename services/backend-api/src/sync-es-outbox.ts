import { createDatabase } from "@tabipla/db";
import { createElasticsearchClient } from "@tabipla/search-core";
import { runEsSyncOutboxOnce } from "./esOutbox.js";

/**
 * pending の ES 同期 outbox を手動で処理する。
 *
 *   pnpm -C services/backend-api sync-es-outbox
 */
async function main(): Promise<void> {
  const db = createDatabase();
  const es = createElasticsearchClient();
  try {
    await runEsSyncOutboxOnce(es, db);
  } finally {
    await db.$client.end();
    await es.close();
  }
}

main().catch((error) => {
  console.error("[sync-es-outbox] 失敗しました:", error);
  process.exit(1);
});

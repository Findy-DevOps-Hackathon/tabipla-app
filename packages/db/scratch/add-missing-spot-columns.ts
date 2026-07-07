import { createDatabase } from "../src/client.js";

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    await db.execute('ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "cluster_id" integer');
    await db.execute('ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "sensory_scores" jsonb');
    console.log("[db] cluster_id / sensory_scores カラムを追加しました。");
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

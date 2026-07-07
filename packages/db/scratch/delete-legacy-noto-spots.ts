import { inArray } from "drizzle-orm";
import { createDatabase } from "../src/client.js";
import { spots } from "../src/schema.js";

/** 旧 seed のプレースホルダー能登スポット ID（新データと重複するため削除）。 */
const LEGACY_NOTO_SPOT_IDS = [
  "e1a2b3c4-d5e6-4789-a012-3456789abcde",
  "f2b3c4d5-e6f7-4890-b123-456789abcdef",
  "a3c4d5e6-f7a8-4901-c234-56789abcdef0",
  "b4d5e6f7-a8b9-4012-d345-6789abcdef01",
  "c5e6f7a8-b9c0-4123-e456-789abcdef012",
  "d6f7a8b9-c0d1-4234-f567-89abcdef0123",
];

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    const existing = await db
      .select({ id: spots.id, name: spots.name })
      .from(spots)
      .where(inArray(spots.id, LEGACY_NOTO_SPOT_IDS));

    if (existing.length === 0) {
      console.log("[db] 削除対象の旧能登スポットはありません。");
      return;
    }

    await db.delete(spots).where(inArray(spots.id, LEGACY_NOTO_SPOT_IDS));
    for (const row of existing) {
      console.log(`[db] 削除: ${row.name} (${row.id})`);
    }
    console.log(`[db] 旧能登スポット ${existing.length} 件を削除しました。`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

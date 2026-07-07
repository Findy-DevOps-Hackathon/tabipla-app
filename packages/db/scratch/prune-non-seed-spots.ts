import { notInArray } from "drizzle-orm";
import { createDatabase } from "../src/client.js";
import { spots } from "../src/schema.js";
import { loadSeedBundle } from "../src/seedData.js";

async function main(): Promise<void> {
  const bundle = await loadSeedBundle();
  const seedIds = bundle.spots.map((s) => s.id);
  const db = createDatabase();

  try {
    const extras = await db
      .select({ id: spots.id, name: spots.name, prefecture: spots.prefecture })
      .from(spots)
      .where(notInArray(spots.id, seedIds));

    if (extras.length === 0) {
      console.log("[db] seed 外のスポットはありません。");
      return;
    }

    await db.delete(spots).where(notInArray(spots.id, seedIds));
    for (const row of extras) {
      console.log(`[db] 削除: ${row.name} (${row.prefecture ?? "?"}) [${row.id}]`);
    }
    console.log(`[db] seed 外スポット ${extras.length} 件を削除しました。`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

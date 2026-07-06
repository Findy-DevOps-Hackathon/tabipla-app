import { and, eq, isNull, or } from "drizzle-orm";
import { createDatabase } from "./client.js";
import { inferNotoAreaFromName, NOTO_UMBRELLA_AREA } from "./destinationMatching.js";
import { spots } from "./schema.js";

/**
 * area 未設定の石川県スポットに市区町村名を推定して付与する。
 *
 *   pnpm -C packages/db backfill:noto-areas
 */
async function main(): Promise<void> {
  const db = createDatabase();

  try {
    const rows = await db
      .select()
      .from(spots)
      .where(
        and(
          eq(spots.prefecture, "石川県"),
          or(isNull(spots.area), eq(spots.area, ""), eq(spots.area, NOTO_UMBRELLA_AREA)),
        ),
      );

    let updated = 0;
    for (const row of rows) {
      const inferred = inferNotoAreaFromName(row.name);
      const nextArea = inferred ?? NOTO_UMBRELLA_AREA;
      if (row.area?.trim() === nextArea) continue;

      await db
        .update(spots)
        .set({ area: nextArea, updatedAt: new Date() })
        .where(eq(spots.id, row.id));
      updated += 1;
      console.log(`[db] ${row.name} → ${nextArea}`);
    }

    console.log(`[db] 能登 area 補完完了: ${updated} / ${rows.length} 件を更新しました。`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] backfill:noto-areas に失敗しました:", error);
  process.exit(1);
});

import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { type NewUnchikuFactRow, type UnchikuFactRow, unchikuFacts } from "../schema.js";

/**
 * spotId に紐づくすべての蘊蓄ネタ（unchiku_facts）を取得する。
 */
export async function getUnchikuFactsBySpotId(
  db: Database,
  spotId: string,
): Promise<UnchikuFactRow[]> {
  return db.select().from(unchikuFacts).where(eq(unchikuFacts.spotId, spotId));
}

/**
 * 蘊蓄ネタを登録・更新する (簡易 upsert)。
 */
export async function upsertUnchikuFact(
  db: Database,
  input: NewUnchikuFactRow,
): Promise<UnchikuFactRow> {
  const [row] = await db
    .insert(unchikuFacts)
    .values(input)
    .onConflictDoUpdate({
      target: unchikuFacts.id,
      set: {
        spotId: input.spotId,
        label: input.label,
        text: input.text,
        source: input.source,
      },
    })
    .returning();

  if (!row) {
    throw new Error("[db] upsertUnchikuFact: 書き込みに失敗しました。");
  }
  return row;
}

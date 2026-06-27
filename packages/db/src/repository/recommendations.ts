import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  type NewRecommendationRow,
  type RecommendationRow,
  recommendations,
} from "../schema.js";

/**
 * recommendations テーブルに対する基本的なデータアクセスを集約する。
 *
 * 正本は PostgreSQL。自治体おすすめの近隣店（お食事処 / お土産）を DB のみで扱う。
 */

/** おすすめ店を作成する（自治体）。 */
export async function createRecommendation(
  db: Database,
  input: NewRecommendationRow,
): Promise<RecommendationRow> {
  const [row] = await db.insert(recommendations).values(input).returning();
  if (!row) {
    throw new Error("[db] createRecommendation: 行の書き込みに失敗しました。");
  }
  return row;
}

/** id でおすすめ店を削除する（自治体）。 */
export async function deleteRecommendation(db: Database, id: string): Promise<void> {
  await db.delete(recommendations).where(eq(recommendations.id, id));
}

/** スポットに紐づくおすすめ店一覧を取得する（観光者向け）。 */
export async function listRecommendationsBySpot(
  db: Database,
  spotId: string,
): Promise<RecommendationRow[]> {
  return db
    .select()
    .from(recommendations)
    .where(eq(recommendations.spotId, spotId))
    .orderBy(desc(recommendations.createdAt));
}

/** 全おすすめ店を取得する（自治体の確認用）。 */
export async function listRecommendations(db: Database): Promise<RecommendationRow[]> {
  return db.select().from(recommendations).orderBy(desc(recommendations.createdAt));
}

/** id でおすすめ店を1件取得する（無ければ undefined）。 */
export async function getRecommendationById(
  db: Database,
  id: string,
): Promise<RecommendationRow | undefined> {
  const [row] = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .limit(1);
  return row;
}

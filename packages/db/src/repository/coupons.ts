import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { type CouponRow, coupons, type NewCouponRow, spots } from "../schema.js";

/**
 * coupons テーブルに対する基本的なデータアクセスを集約する。
 *
 * 正本は PostgreSQL。クーポンは検索（Elasticsearch）対象ではなく DB のみで扱う。
 */

/** クーポンを作成する（自治体）。 */
export async function createCoupon(db: Database, input: NewCouponRow): Promise<CouponRow> {
  const [row] = await db.insert(coupons).values(input).returning();
  if (!row) {
    throw new Error("[db] createCoupon: 行の書き込みに失敗しました。");
  }
  return row;
}

/** id でクーポンを削除する（自治体）。 */
export async function deleteCoupon(db: Database, id: string): Promise<void> {
  await db.delete(coupons).where(eq(coupons.id, id));
}

/** スポットに紐づくクーポン一覧を取得する（観光者向け）。 */
export async function listCouponsBySpot(db: Database, spotId: string): Promise<CouponRow[]> {
  return db
    .select()
    .from(coupons)
    .where(eq(coupons.spotId, spotId))
    .orderBy(desc(coupons.createdAt));
}

/** 全クーポンを取得する（自治体の確認用）。 */
export async function listCoupons(db: Database): Promise<CouponRow[]> {
  return db.select().from(coupons).orderBy(desc(coupons.createdAt));
}

/** 全クーポンをスポット名付きで取得する（観光者向け公開API用）。 */
export async function listCouponsWithSpotName(db: Database) {
  return db
    .select({
      id: coupons.id,
      spotId: coupons.spotId,
      spotName: spots.name,
      title: coupons.title,
      description: coupons.description,
      discountPercent: coupons.discountPercent,
      createdAt: coupons.createdAt,
      updatedAt: coupons.updatedAt,
    })
    .from(coupons)
    .innerJoin(spots, eq(coupons.spotId, spots.id))
    .orderBy(desc(coupons.createdAt));
}

/** id でクーポンを1件取得する（無ければ undefined）。 */
export async function getCouponById(db: Database, id: string): Promise<CouponRow | undefined> {
  const [row] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return row;
}

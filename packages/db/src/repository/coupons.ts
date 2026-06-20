import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { type CouponRow, coupons, type NewCouponRow } from "../schema.js";

/**
 * spotId に紐づくすべてのクーポン（coupons）を取得する。
 */
export async function getCouponsBySpotId(db: Database, spotId: string): Promise<CouponRow[]> {
  return db.select().from(coupons).where(eq(coupons.spotId, spotId));
}

/**
 * クーポンを登録・更新する (簡易 upsert)。
 */
export async function upsertCoupon(db: Database, input: NewCouponRow): Promise<CouponRow> {
  const [row] = await db
    .insert(coupons)
    .values(input)
    .onConflictDoUpdate({
      target: coupons.id,
      set: {
        spotId: input.spotId,
        title: input.title,
        description: input.description,
        discount: input.discount,
        conditions: input.conditions,
        validUntil: input.validUntil,
      },
    })
    .returning();

  if (!row) {
    throw new Error("[db] upsertCoupon: 書き込みに失敗しました。");
  }
  return row;
}

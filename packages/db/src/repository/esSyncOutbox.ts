import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { type EsSyncOutboxRow, esSyncOutbox } from "../schema.js";

export type EsSyncOperation = "upsert" | "patch" | "delete";

export type EsSyncOutboxPayload = {
  embedding?: number[];
};

const MAX_RETRY_ATTEMPTS = 10;

/** 再試行までの待機秒数（指数バックオフ、最大 1 時間）。 */
function computeRetryDelaySeconds(attempts: number): number {
  const base = Math.min(3600, 10 * 2 ** Math.min(attempts, 8));
  return base;
}

/**
 * ES 同期ジョブを outbox に積む。
 * 同一 spot_id の pending があれば最新操作で上書きする。
 */
export async function enqueueEsSync(
  db: Database,
  spotId: string,
  operation: EsSyncOperation,
  payload: EsSyncOutboxPayload | null = null,
): Promise<EsSyncOutboxRow> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(esSyncOutbox)
    .where(and(eq(esSyncOutbox.spotId, spotId), eq(esSyncOutbox.status, "pending")))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(esSyncOutbox)
      .set({
        operation,
        payload: payload ?? null,
        attempts: 0,
        nextRetryAt: now,
        lastError: null,
        completedAt: null,
      })
      .where(eq(esSyncOutbox.id, existing.id))
      .returning();
    if (!row) {
      throw new Error(`[db] enqueueEsSync: pending 行の更新に失敗しました (spotId=${spotId})`);
    }
    return row;
  }

  const [row] = await db
    .insert(esSyncOutbox)
    .values({
      spotId,
      operation,
      payload: payload ?? null,
      status: "pending",
      attempts: 0,
      nextRetryAt: now,
    })
    .returning();

  if (!row) {
    throw new Error(`[db] enqueueEsSync: 行の書き込みに失敗しました (spotId=${spotId})`);
  }
  return row;
}

/** 再試行対象の pending ジョブを取得する。 */
export async function listPendingEsSync(db: Database, limit: number): Promise<EsSyncOutboxRow[]> {
  const now = new Date();
  return db
    .select()
    .from(esSyncOutbox)
    .where(and(eq(esSyncOutbox.status, "pending"), lte(esSyncOutbox.nextRetryAt, now)))
    .orderBy(asc(esSyncOutbox.createdAt))
    .limit(limit);
}

/** 同期成功時に outbox エントリを完了にする。 */
export async function markEsSyncCompleted(db: Database, id: string): Promise<void> {
  await db
    .update(esSyncOutbox)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
    })
    .where(eq(esSyncOutbox.id, id));
}

/** 同期失敗時に試行回数と次回再試行時刻を更新する。 */
export async function markEsSyncFailed(
  db: Database,
  id: string,
  error: string,
  attempts: number,
): Promise<void> {
  const delaySeconds = computeRetryDelaySeconds(attempts);
  const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);
  await db
    .update(esSyncOutbox)
    .set({
      attempts,
      nextRetryAt,
      lastError: error.slice(0, 2000),
      ...(attempts >= MAX_RETRY_ATTEMPTS
        ? {}
        : {
            status: "pending" as const,
          }),
    })
    .where(eq(esSyncOutbox.id, id));
}

/** pending の件数を返す（ヘルスチェック・監視用）。 */
export async function countPendingEsSync(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(esSyncOutbox)
    .where(eq(esSyncOutbox.status, "pending"));
  return row?.value ?? 0;
}

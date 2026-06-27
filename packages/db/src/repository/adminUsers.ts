import { eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { type AdminUserRow, adminUsers, type NewAdminUserRow } from "../schema.js";

/** メールアドレスで管理ユーザーを1件取得する。 */
export async function getAdminUserByEmail(
  db: Database,
  email: string,
): Promise<AdminUserRow | undefined> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalized)).limit(1);
  return row;
}

/** 管理ユーザーを upsert する（seed 用）。 */
export async function upsertAdminUser(db: Database, input: NewAdminUserRow): Promise<AdminUserRow> {
  const now = new Date();
  const [row] = await db
    .insert(adminUsers)
    .values({ ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: adminUsers.id,
      set: {
        email: sql`excluded.email`,
        passwordHash: sql`excluded.password_hash`,
        municipalityName: sql`excluded.municipality_name`,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("[db] upsertAdminUser: 行の書き込みに失敗しました。");
  }
  return row;
}

import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { type NewUserRow, type UserRow, users } from "../schema.js";

/** メールアドレスで会員を1件取得する（未登録なら undefined）。 */
export async function getUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return row;
}

/** 会員を新規作成する。email の一意制約に違反した場合は例外を送出する。 */
export async function createUser(db: Database, input: NewUserRow): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({ ...input, email: input.email.trim().toLowerCase() })
    .returning();

  if (!row) {
    throw new Error("[db] createUser: 行の書き込みに失敗しました。");
  }
  return row;
}

/** 会員を ID で削除する（退会）。削除できたら true。 */
export async function deleteUserById(db: Database, id: string): Promise<boolean> {
  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return deleted.length > 0;
}

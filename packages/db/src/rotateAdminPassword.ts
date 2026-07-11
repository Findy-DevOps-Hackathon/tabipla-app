import { eq } from "drizzle-orm";
import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import { adminUsers } from "./schema.js";

/**
 * 管理ユーザーのパスワードを更新する（本番ローテーション用）。
 *
 *   ADMIN_NEW_PASSWORD='...' pnpm -C packages/db rotate:admin-password -- <email>
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env.ADMIN_NEW_PASSWORD?.trim();

  if (!email) {
    console.error("[db] 使い方: ADMIN_NEW_PASSWORD='...' rotate:admin-password <email>");
    process.exit(1);
  }
  if (!password) {
    console.error("[db] ADMIN_NEW_PASSWORD が未設定です。");
    process.exit(1);
  }

  const db = createDatabase();
  try {
    const passwordHash = await hashPassword(password);
    const updated = await db
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.email, email))
      .returning({ id: adminUsers.id, email: adminUsers.email });

    if (updated.length === 0) {
      console.error(`[db] ユーザーが見つかりません: ${email}`);
      process.exit(1);
    }

    console.log(`[db] パスワードを更新しました: ${email}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] パスワード更新に失敗しました:", error);
  process.exit(1);
});

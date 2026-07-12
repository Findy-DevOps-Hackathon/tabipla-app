import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import { upsertAdminUser } from "./repository/adminUsers.js";
import { upsertSpots } from "./repository/spots.js";
import { municipalities } from "./schema.js";
import { loadSeedBundle, type SeedAdminUser, seedSpotToRow } from "./seedData.js";
import { installSeedImages } from "./seedInstallImages.js";

function adminSeedEnvKey(kind: "EMAIL" | "PASSWORD", index: number): string {
  return `ADMIN_SEED_${kind}_${index}`;
}

function resolveAdminEmail(adminUser: SeedAdminUser, index: number): string {
  if (adminUser.email?.trim()) return adminUser.email.trim().toLowerCase();
  const email = process.env[adminSeedEnvKey("EMAIL", index)]?.trim();
  if (!email) {
    throw new Error(
      `${adminUser.id} のメールアドレスが未設定です。${adminSeedEnvKey("EMAIL", index)} を設定してください。`,
    );
  }
  return email.toLowerCase();
}

function resolveAdminPassword(adminUser: SeedAdminUser, index: number): string {
  const password = process.env[adminSeedEnvKey("PASSWORD", index)]?.trim();
  if (!password) {
    throw new Error(
      `${adminUser.id} のパスワードが未設定です。${adminSeedEnvKey("PASSWORD", index)} を設定してください。`,
    );
  }
  return password;
}

/**
 * 開発用シードデータ投入スクリプト。
 *
 *   pnpm -C packages/db seed
 *
 * `seed-data/`（`pnpm -C packages/db seed:export` で更新）を PostgreSQL と
 * backend-api の uploads へ反映する。冪等（同一 id は upsert）。
 *
 * 管理ユーザー:
 *   id: seed-data/admin-users.json 参照
 *   email / パスワード: ADMIN_SEED_EMAIL_<n> / ADMIN_SEED_PASSWORD_<n>（必須、n は JSON 配列の 0 始まりインデックス）
 */
async function main(): Promise<void> {
  const bundle = await loadSeedBundle();
  const db = createDatabase();

  try {
    for (const municipality of bundle.municipalities) {
      await db.insert(municipalities).values(municipality).onConflictDoNothing();
    }

    for (const [index, adminUser] of bundle.adminUsers.entries()) {
      const email = resolveAdminEmail(adminUser, index);
      const password = resolveAdminPassword(adminUser, index);
      await upsertAdminUser(db, {
        ...adminUser,
        email,
        passwordHash: await hashPassword(password),
      });
    }

    const imageInstall = await installSeedImages(bundle.spots);
    const rows = await upsertSpots(db, imageInstall.spots.map(seedSpotToRow));

    const { counts } = bundle.manifest;
    console.log(
      `[db] seed 完了: 自治体 ${counts.municipalities} 件、管理ユーザー ${counts.adminUsers} 件、` +
        `スポット ${rows.length} 件（画像 ${imageInstall.installed} 件/${imageInstall.target}）を upsert しました。`,
    );
    for (const [index, adminUser] of bundle.adminUsers.entries()) {
      console.log(
        `[db] 管理ユーザー upsert: ${adminUser.id} (${resolveAdminEmail(adminUser, index)})`,
      );
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] seed に失敗しました:", error);
  process.exit(1);
});

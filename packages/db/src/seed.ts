import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import { upsertAdminUser } from "./repository/adminUsers.js";
import { upsertCoupon } from "./repository/coupons.js";
import { upsertSpots } from "./repository/spots.js";
import { municipalities } from "./schema.js";
import { loadSeedBundle, type SeedAdminUser, seedSpotToRow } from "./seedData.js";
import { installSeedImages } from "./seedInstallImages.js";

function resolveAdminEmail(adminUser: SeedAdminUser): string {
  if (adminUser.email?.trim()) return adminUser.email.trim().toLowerCase();
  const email =
    adminUser.id === "admin-komoro"
      ? process.env.ADMIN_KOMORO_EMAIL?.trim()
      : process.env.ADMIN_NOTO_EMAIL?.trim();
  if (!email) {
    throw new Error(
      `${adminUser.id} のメールアドレスが未設定です。ADMIN_KOMORO_EMAIL / ADMIN_NOTO_EMAIL を設定してください。`,
    );
  }
  return email.toLowerCase();
}

function resolveAdminPassword(
  adminUser: SeedAdminUser,
  komoroPassword: string,
  defaultPassword: string,
): string {
  return adminUser.id === "admin-komoro" ? komoroPassword : defaultPassword;
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
 *   email: ADMIN_KOMORO_EMAIL / ADMIN_NOTO_EMAIL（必須）
 *   パスワード: ADMIN_KOMORO_SEED_PASSWORD / ADMIN_SEED_PASSWORD（必須）
 */
async function main(): Promise<void> {
  const bundle = await loadSeedBundle();
  const db = createDatabase();

  try {
    const komoroPassword = process.env.ADMIN_KOMORO_SEED_PASSWORD?.trim();
    const defaultPassword = process.env.ADMIN_SEED_PASSWORD?.trim();
    if (!komoroPassword || !defaultPassword) {
      throw new Error(
        "ADMIN_KOMORO_SEED_PASSWORD と ADMIN_SEED_PASSWORD を設定してから seed を実行してください。",
      );
    }

    for (const municipality of bundle.municipalities) {
      await db.insert(municipalities).values(municipality).onConflictDoNothing();
    }

    for (const adminUser of bundle.adminUsers) {
      const email = resolveAdminEmail(adminUser);
      const password = resolveAdminPassword(adminUser, komoroPassword, defaultPassword);
      await upsertAdminUser(db, {
        ...adminUser,
        email,
        passwordHash: await hashPassword(password),
      });
    }

    const imageInstall = await installSeedImages(bundle.spots);
    const rows = await upsertSpots(db, imageInstall.spots.map(seedSpotToRow));

    for (const coupon of bundle.coupons) {
      await upsertCoupon(db, coupon);
    }

    const { counts } = bundle.manifest;
    console.log(
      `[db] seed 完了: 自治体 ${counts.municipalities} 件、管理ユーザー ${counts.adminUsers} 件、` +
        `スポット ${rows.length} 件（画像 ${imageInstall.installed} 件/${imageInstall.target}）、クーポン ${counts.coupons} 件を upsert しました。`,
    );
    for (const adminUser of bundle.adminUsers) {
      console.log(`[db] 管理ユーザー upsert: ${adminUser.id} (${resolveAdminEmail(adminUser)})`);
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] seed に失敗しました:", error);
  process.exit(1);
});

import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import { upsertAdminUser } from "./repository/adminUsers.js";
import { upsertCoupon } from "./repository/coupons.js";
import { upsertSpots } from "./repository/spots.js";
import { upsertUnchikuFact } from "./repository/unchiku.js";
import { municipalities } from "./schema.js";
import { loadSeedBundle } from "./seedData.js";
import { installSeedImages } from "./seedInstallImages.js";

/**
 * 開発用シードデータ投入スクリプト。
 *
 *   pnpm -C packages/db seed
 *
 * `seed-data/`（`pnpm -C packages/db seed:export` で更新）を PostgreSQL と
 * backend-api の uploads へ反映する。冪等（同一 id は upsert）。
 *
 * 管理ユーザー:
 *   email: seed-data/admin-users.json 参照
 *   admin@example.com: ADMIN_KOMORO_SEED_PASSWORD（未設定時 test-admin-password）
 *   その他: ADMIN_SEED_PASSWORD（未設定時 Zaq12wsx#）
 */
async function main(): Promise<void> {
  const bundle = await loadSeedBundle();
  const db = createDatabase();

  try {
    const komoroPassword = process.env.ADMIN_KOMORO_SEED_PASSWORD ?? "test-admin-password";
    const defaultPassword = process.env.ADMIN_SEED_PASSWORD ?? "Zaq12wsx#";

    for (const municipality of bundle.municipalities) {
      await db.insert(municipalities).values(municipality).onConflictDoNothing();
    }

    for (const adminUser of bundle.adminUsers) {
      const password = adminUser.email === "admin@example.com" ? komoroPassword : defaultPassword;
      await upsertAdminUser(db, {
        ...adminUser,
        passwordHash: await hashPassword(password),
      });
    }

    const imageInstall = await installSeedImages(bundle.spots);
    const rows = await upsertSpots(db, imageInstall.spots);

    for (const coupon of bundle.coupons) {
      await upsertCoupon(db, coupon);
    }

    for (const unchiku of bundle.unchikuFacts) {
      await upsertUnchikuFact(db, unchiku);
    }

    const { counts } = bundle.manifest;
    console.log(
      `[db] seed 完了: 自治体 ${counts.municipalities} 件、管理ユーザー ${counts.adminUsers} 件、` +
        `スポット ${rows.length} 件（画像 ${imageInstall.installed} 件/${imageInstall.target}）、クーポン ${counts.coupons} 件、` +
        `蘊蓄 ${counts.unchikuFacts} 件を upsert しました。`,
    );
    for (const adminUser of bundle.adminUsers) {
      const password = adminUser.email === "admin@example.com" ? komoroPassword : defaultPassword;
      console.log("[db] ログイン:", adminUser.email, "/", password);
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] seed に失敗しました:", error);
  process.exit(1);
});

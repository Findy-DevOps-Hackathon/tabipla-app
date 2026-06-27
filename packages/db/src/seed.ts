import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import { upsertAdminUser } from "./repository/adminUsers.js";
import { upsertSpots } from "./repository/spots.js";
import type { NewSpotRow } from "./schema.js";

/**
 * 開発用シードデータ投入スクリプト。
 *
 *   pnpm -C packages/db seed
 *
 * DATABASE_URL で接続先を指定する。冪等（同一 id は upsert）。
 * デモ自治体: 長野県小諸市（管理画面マスタと一致）
 *
 * 管理ユーザー:
 *   email: admin@example.com
 *   password: ADMIN_SEED_PASSWORD 環境変数（未設定時 test-admin-password）
 */
const sampleSpots: NewSpotRow[] = [
  {
    id: "spot-kiyomizu",
    name: "懐古園",
    description: "小諸城址の公園。紅葉の名所。",
    category: ["観光", "歴史"],
    area: "小諸市",
    prefecture: "長野県",
    address: "長野県小諸市中央1丁目",
    tags: ["紅葉", "城址", "公園"],
    lat: 36.325,
    lon: 138.425,
    price: 0,
  },
  {
    id: "spot-fushimi-inari",
    name: "高峰高原",
    description: "標高約2,000mの高原。トレッキングや雲海の展望が人気。",
    category: ["自然"],
    area: "小諸市",
    prefecture: "長野県",
    address: "長野県小諸市高峰",
    tags: ["トレッキング", "雲海"],
    lat: 36.35,
    lon: 138.45,
  },
  {
    id: "spot-arashiyama-bamboo",
    name: "停車場ガーデン",
    description: "地元食材を使ったカフェと庭園。小諸の食文化を楽しめる。",
    category: ["グルメ", "観光"],
    area: "小諸市",
    prefecture: "長野県",
    address: "長野県小諸市本町",
    tags: ["カフェ", "地元食材"],
    lat: 36.328,
    lon: 138.422,
    price: 1500,
  },
];

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    const seedPassword = process.env.ADMIN_SEED_PASSWORD ?? "test-admin-password";
    const passwordHash = await hashPassword(seedPassword);
    await upsertAdminUser(db, {
      id: "admin-komoro",
      email: "admin@example.com",
      passwordHash,
      municipalityName: "小諸市",
    });

    const rows = await upsertSpots(db, sampleSpots);
    console.log(
      `[db] seed 完了: 管理ユーザー 1 件、スポット ${rows.length} 件を upsert しました。`,
    );
    console.log("[db] ログイン: admin@example.com /", seedPassword);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] seed に失敗しました:", error);
  process.exit(1);
});

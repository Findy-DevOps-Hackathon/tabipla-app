import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import { upsertAdminUser } from "./repository/adminUsers.js";
import { upsertSpots } from "./repository/spots.js";
import { upsertCoupon } from "./repository/coupons.js";
import { upsertUnchikuFact } from "./repository/unchiku.js";
import { municipalities } from "./schema.js";
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
    municipalityId: "mun-komoro",
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
    municipalityId: "mun-komoro",
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
    municipalityId: "mun-komoro",
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

    // 自治体シード
    await db.insert(municipalities).values({
      id: "mun-komoro",
      name: "小諸市",
    }).onConflictDoNothing();

    await upsertAdminUser(db, {
      id: "admin-komoro",
      email: "admin@example.com",
      passwordHash,
      municipalityName: "小諸市",
    });

    const rows = await upsertSpots(db, sampleSpots);

    // クーポンシード
    const sampleCoupons = [
      {
        id: "coupon-1",
        spotId: "spot-kiyomizu",
        title: "懐古園 入場料100円引き",
        description: "入園料（散策券）がお一人様100円引きになります。",
        discount: "100円引き",
        conditions: "受付窓口で画面をご提示ください。",
        validUntil: "2026-12-31",
      },
      {
        id: "coupon-2",
        spotId: "spot-arashiyama-bamboo",
        title: "停車場ガーデン カフェ10%割引",
        description: "カフェでのご飲食代金が10%割引になります（お食事ご注文の方に限る）。",
        discount: "10%引き",
        conditions: "ご注文時に画面をご提示ください。",
        validUntil: "2026-12-31",
      },
    ];

    for (const c of sampleCoupons) {
      await upsertCoupon(db, c);
    }

    // 蘊蓄シード
    const sampleUnchiku = [
      {
        id: "unchiku-1",
        spotId: "spot-kiyomizu",
        label: "構造",
        text: "懐古園（小諸城址）は、城下町よりも低い場所に位置する珍しい「穴城（あなじろ）」です。",
        source: "小諸市観光協会公式ガイド",
      },
      {
        id: "unchiku-2",
        spotId: "spot-fushimi-inari",
        label: "雲海",
        text: "高峰高原は標高約2,000mに位置し、気象条件が揃うと美しい雲海を見渡すことができます。",
        source: "高峰高原ビジターセンター",
      },
    ];

    for (const u of sampleUnchiku) {
      await upsertUnchikuFact(db, u);
    }

    console.log(
      `[db] seed 完了: 自治体 1 件、管理ユーザー 1 件、スポット ${rows.length} 件、クーポン ${sampleCoupons.length} 件、蘊蓄 ${sampleUnchiku.length} 件を upsert しました。`,
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

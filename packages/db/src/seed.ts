import { createDatabase } from "./client.js";
import { upsertSpots } from "./repository/spots.js";
import type { NewSpotRow } from "./schema.js";

/**
 * 開発用シードデータ投入スクリプト。
 *
 *   pnpm -C packages/db seed
 *
 * DATABASE_URL で接続先を指定する。冪等（同一 id は upsert）。
 */
const sampleSpots: NewSpotRow[] = [
  {
    id: "spot-kiyomizu",
    name: "清水寺",
    description: "京都を代表する世界遺産の寺院。清水の舞台で知られる。",
    category: "観光",
    area: "京都市",
    prefecture: "京都府",
    address: "京都府京都市東山区清水1丁目294",
    tags: ["寺", "世界遺産"],
    lat: 34.9948,
    lon: 135.785,
  },
  {
    id: "spot-fushimi-inari",
    name: "伏見稲荷大社",
    description: "千本鳥居で有名な神社。全国の稲荷神社の総本宮。",
    category: "観光",
    area: "京都市",
    prefecture: "京都府",
    address: "京都府京都市伏見区深草薮之内町68",
    tags: ["神社", "鳥居"],
    lat: 34.9671,
    lon: 135.7727,
  },
  {
    id: "spot-arashiyama-bamboo",
    name: "嵐山 竹林の小径",
    description: "嵯峨野にある竹林の散策路。風情ある景観が人気。",
    category: "自然",
    area: "京都市",
    prefecture: "京都府",
    address: "京都府京都市右京区嵯峨天龍寺芒ノ馬場町",
    tags: ["自然", "竹林"],
    lat: 35.0169,
    lon: 135.6716,
  },
];

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    const rows = await upsertSpots(db, sampleSpots);
    console.log(`[db] seed 完了: ${rows.length} 件を upsert しました。`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] seed に失敗しました:", error);
  process.exit(1);
});

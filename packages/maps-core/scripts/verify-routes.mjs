/**
 * maps-core 疎通確認スクリプト（search-core の verify.mjs と同じ流儀）
 *
 * 使い方:
 *   pnpm -F @tabipla/maps-core build
 *   GOOGLE_MAPS_API_KEY=<your-key> pnpm -F @tabipla/maps-core verify
 *
 * または:
 *   cp .env.example .env  # GOOGLE_MAPS_API_KEY を設定する
 *   pnpm -F @tabipla/maps-core verify
 *
 * 注意:
 *   - Routes API を実際に呼び出すため、APIキーと課金が必要です。
 *   - GOOGLE_MAPS_API_KEY が未設定の場合はエラーで終了します。
 */

import { getTravelTimes } from "../dist/index.js";

// 小諸市近辺の座標でテスト（デモデータに合わせた地点）
const origin = { lat: 36.331, lon: 138.425 }; // 小諸市 大手
const destinations = [
  { lat: 36.329, lon: 138.424 }, // 小諸城址 懐古園
  { lat: 36.338, lon: 138.411 }, // 布引観音
  { lat: 36.3, lon: 138.409 }, // 荒神山
];

if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.error("❌ GOOGLE_MAPS_API_KEY が未設定です。.env に設定してから再実行してください。");
  process.exit(1);
}

console.log("=== maps-core 疎通確認 ===");
console.log("origin:", origin);
console.log(`destinations: ${destinations.length} 件`);
console.log("modes: DRIVE, WALK");
console.log("");

try {
  const result = await getTravelTimes({
    origin,
    destinations,
    modes: ["DRIVE", "WALK"],
  });

  console.log("--- DRIVE ---");
  for (const leg of result.results.DRIVE ?? []) {
    console.log(
      `  destinations[${leg.destinationIndex}]: ` +
        `${leg.durationSeconds != null ? `${leg.durationSeconds}秒` : "N/A"} / ` +
        `${leg.distanceMeters != null ? `${leg.distanceMeters}m` : "N/A"} [${leg.status}]`,
    );
  }

  console.log("--- WALK ---");
  for (const leg of result.results.WALK ?? []) {
    console.log(
      `  destinations[${leg.destinationIndex}]: ` +
        `${leg.durationSeconds != null ? `${leg.durationSeconds}秒` : "N/A"} / ` +
        `${leg.distanceMeters != null ? `${leg.distanceMeters}m` : "N/A"} [${leg.status}]`,
    );
  }

  console.log("\n✅ 疎通確認 成功");
} catch (err) {
  console.error("\n❌ 疎通確認 失敗:", err.message ?? err);
  process.exit(1);
}

import seedRows from "../../../../packages/db/seed-data/spots.json";
import { documentToComparisonSwipeSpot, documentToRecommendation } from "../lib/spotMapper.ts";
import type { SpotDocument } from "../types.ts";
import type { DiagnosisSpotCategory, Recommendation, SwipeSpot } from "./spots.ts";

const KOMORO = { prefecture: "長野県", area: "小諸市" } as const;

/** 好み診断で各1件ずつ確保するカテゴリ（表示4分類 + DB 3分類）。 */
export const COMPARISON_DIAGNOSIS_CATEGORIES: DiagnosisSpotCategory[] = [
  "観光",
  "グルメ",
  "自然",
  "歴史",
  "都市",
  "芸術",
  "レジャー・スポーツ",
];

function isComparisonPoolRow(row: SpotDocument): boolean {
  return row.area === KOMORO.area || row.prefecture === "石川県";
}

function toComparisonSpot(row: SpotDocument): SwipeSpot {
  const dest = {
    prefecture: row.prefecture ?? KOMORO.prefecture,
    area: row.area ?? KOMORO.area,
  };
  return documentToComparisonSwipeSpot(row, dest);
}

/**
 * 好み診断の比較カード用固定プール。
 * seed-data の小諸市 + 石川県スポット（好み把握のみ・目的地混在可）。
 * 都市・芸術・レジャー・スポーツは DB カテゴリをそのまま表示する。
 */
export const COMPARISON_SPOT_POOL: SwipeSpot[] = (seedRows as SpotDocument[])
  .filter(isComparisonPoolRow)
  .map(toComparisonSpot)
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

/** ホーム探索フォールバック（小諸市のみ・従来4分類）。 */
export const COMPARISON_EXPLORE_SPOTS: Recommendation[] = (seedRows as SpotDocument[])
  .filter((row) => row.area === KOMORO.area)
  .map((row) => documentToRecommendation(row, KOMORO))
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

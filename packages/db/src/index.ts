/**
 * @tabipla/db 公開API
 *
 * アプリのマスターデータ用 DB 層（Drizzle ORM + PostgreSQL）。
 * 検索ロジック（Elasticsearch）は持たず、正本データの読み書きのみを提供する。
 * Elasticsearch への反映は利用側（backend-api の reindex）が search-core 経由で行う。
 */

export type { CreateDatabaseOptions, Database } from "./client.js";
// クライアント
export { createDatabase } from "./client.js";
// リポジトリ（spots）
export {
  countSpots,
  deleteSpot,
  getSpotById,
  iterateAllSpots,
  listSpotsAfter,
  upsertSpot,
  upsertSpots,
} from "./repository/spots.js";
export type { NewSpotRow, SpotRow } from "./schema.js";
// スキーマ / 型
export { spots } from "./schema.js";

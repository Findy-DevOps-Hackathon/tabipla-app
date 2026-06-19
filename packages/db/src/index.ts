/**
 * @tabipla/db 公開API
 *
 * アプリのマスターデータ用 DB 層（Drizzle ORM + PostgreSQL）。
 * 検索ロジック（Elasticsearch）は持たず、正本データの読み書きのみを提供する。
 * Elasticsearch への反映は利用側（backend-api の reindex）が search-core 経由で行う。
 */

// クライアント
export { createDatabase } from "./client.js";
export type { Database, CreateDatabaseOptions } from "./client.js";

// スキーマ / 型
export { spots } from "./schema.js";
export type { SpotRow, NewSpotRow } from "./schema.js";

// リポジトリ（spots）
export {
  upsertSpot,
  upsertSpots,
  getSpotById,
  deleteSpot,
  countSpots,
  listSpotsAfter,
  iterateAllSpots,
} from "./repository/spots.js";

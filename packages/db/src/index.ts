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
export {
  buildDestinationMatchClauses,
  type DestinationFilter,
  type DestinationMatchClause,
  extractNotoAreaFromAddress,
  inferNotoAreaFromName,
  isIncompleteNotoSpot,
  isNotoMunicipality,
  NOTO_MUNICIPALITY_AREAS,
  NOTO_UMBRELLA_AREA,
  resolveSpotArea,
  spotMatchesDestinations,
} from "./destinationMatching.js";
export { hashPassword, verifyPassword } from "./password.js";
export { getAdminUserByEmail, upsertAdminUser } from "./repository/adminUsers.js";
export type { EsSyncOperation, EsSyncOutboxPayload } from "./repository/esSyncOutbox.js";
export {
  countPendingEsSync,
  enqueueEsSync,
  listPendingEsSync,
  markEsSyncCompleted,
  markEsSyncFailed,
} from "./repository/esSyncOutbox.js";
export type { ListSpotsOptions } from "./repository/spots.js";
// リポジトリ（spots）
export {
  countSpots,
  deleteSpot,
  getSpotById,
  iterateAllSpots,
  listSpots,
  listSpotsAfter,
  upsertSpot,
  upsertSpots,
} from "./repository/spots.js";
// リポジトリ（会員ユーザー）
export { createUser, deleteUserById, getUserByEmail } from "./repository/users.js";
// スキーマ / 型
export type {
  AdminUserRow,
  EsSyncOutboxRow,
  MunicipalityRow,
  NewAdminUserRow,
  NewEsSyncOutboxRow,
  NewMunicipalityRow,
  NewSpotFeedbackRow,
  NewSpotRow,
  NewTripFeedbackRow,
  NewTripPlanRow,
  NewUserPreferenceRow,
  NewUserRow,
  SpotFeedbackRow,
  SpotRow,
  TripFeedbackRow,
  TripPlanRow,
  UserPreferenceRow,
  UserRow,
} from "./schema.js";
export {
  adminUsers,
  esSyncOutbox,
  municipalities,
  spotFeedbacks,
  spots,
  tripFeedbacks,
  tripPlans,
  userPreferences,
  users,
} from "./schema.js";

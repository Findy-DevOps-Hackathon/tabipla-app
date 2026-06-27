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
export { hashPassword, verifyPassword } from "./password.js";
export { getAdminUserByEmail, upsertAdminUser } from "./repository/adminUsers.js";
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
// リポジトリ（クーポン）
export { getCouponsBySpotId, upsertCoupon } from "./repository/coupons.js";
// リポジトリ（蘊蓄）
export { getUnchikuFactsBySpotId, upsertUnchikuFact } from "./repository/unchiku.js";
// リポジトリ（会員ユーザー）
export { createUser, deleteUserById, getUserByEmail } from "./repository/users.js";
// スキーマ / 型
export type {
  AdminUserRow,
  NewAdminUserRow,
  NewSpotRow,
  NewUserRow,
  SpotRow,
  UserRow,
  MunicipalityRow,
  NewMunicipalityRow,
  UnchikuFactRow,
  NewUnchikuFactRow,
  CouponRow,
  NewCouponRow,
  UserPreferenceRow,
  NewUserPreferenceRow,
  SpotFeedbackRow,
  NewSpotFeedbackRow,
  TripFeedbackRow,
  NewTripFeedbackRow,
  TripPlanRow,
  NewTripPlanRow,
} from "./schema.js";
export {
  adminUsers,
  spots,
  users,
  municipalities,
  unchikuFacts,
  coupons,
  userPreferences,
  spotFeedbacks,
  tripFeedbacks,
  tripPlans,
} from "./schema.js";


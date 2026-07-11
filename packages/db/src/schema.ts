import { randomUUID } from "node:crypto";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * municipalities テーブル（自治体データ）。
 */
export const municipalities = pgTable("municipalities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  apiKeyHash: text("api_key_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** SELECT 時の行型。 */
export type MunicipalityRow = typeof municipalities.$inferSelect;
/** INSERT 時の入力型。 */
export type NewMunicipalityRow = typeof municipalities.$inferInsert;

/**
 * spots テーブル（観光スポットのマスターデータ）。
 *
 * search-core の `SpotDocument` に対応する元データを保持する。
 * Elasticsearch には検索用の写しを reindex で投入し、本テーブルが信頼できる正本とする。
 *
 * 設計メモ:
 *   - `highlights` は PostgreSQL の text[] で保持する。
 *   - `embedding` は本テーブルでは保持しない（ベクトルは Elasticsearch 側で管理する方針）。
 *     Embedding 生成・投入は RAG パイプライン側（別タスク）で行う。
 */
export const spots = pgTable(
  "spots",
  {
    /** 一意なID。未指定時は UUID を採番する（ES の _id としても使う）。 */
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** 自治体IDへの参照。 */
    municipalityId: text("municipality_id").references(() => municipalities.id),
    /** スポット名（全文検索 of 主対象）。 */
    name: text("name").notNull(),
    /** 説明・本文。 */
    description: text("description").notNull(),
    /** カテゴリ（最大3件。例: ["観光", "自然"]）。 */
    category: text("category").array(),
    /** エリア・地域名（例: 京都市）。 */
    area: text("area"),
    /** 都道府県。 */
    prefecture: text("prefecture"),
    /** 住所。 */
    address: text("address"),
    /** おすすめポイント（例: ["紅葉の名所", "城址散策"]）。 */
    highlights: text("highlights").array(),
    /** スポット画像 URL（相対パス `/uploads/spots/...` または外部 URL）。 */
    imageUrl: text("image_url"),
    /** クラスタリングID（事前クラスタリングによる分類）。 */
    clusterId: integer("cluster_id"),
    /** 9次元の感性・知名度スコアオブジェクト */
    sensoryScores: jsonb("sensory_scores"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("spots_category_idx").on(table.category),
    prefectureIdx: index("spots_prefecture_idx").on(table.prefecture),
    updatedAtIdx: index("spots_updated_at_idx").on(table.updatedAt),
  }),
);

/** SELECT 時の行型。 */
export type SpotRow = typeof spots.$inferSelect;
/** INSERT 時の入力型。 */
export type NewSpotRow = typeof spots.$inferInsert;

/**
 * 管理画面ログインユーザー。
 *
 * 自治体ごとに1アカウント想定（デモ: 小諸市）。
 */
export const adminUsers = pgTable(
  "admin_users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    municipalityName: text("municipality_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("admin_users_email_idx").on(table.email),
  }),
);

export type AdminUserRow = typeof adminUsers.$inferSelect;
export type NewAdminUserRow = typeof adminUsers.$inferInsert;

/**
 * 旅行者（user-web）の会員アカウント。
 *
 * 「行った履歴」などの保存に使う。パスワードは scrypt でハッシュ化して保持する。
 */
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * user_preferences テーブル（ユーザーの好みプロファイル）。
 *
 * エージェントが学習した好み情報やトーン＆マナーのメモを永続化します。
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id").notNull().unique(), // デモユーザーID ("demo") にも対応するため references はあえて貼らない
    categoryScore: jsonb("category_score"), // カテゴリごとのスコア (JSONB)
    tagScore: jsonb("tag_score"), // 特徴タグごとのスコア (JSONB)
    preferredPriceMax: integer("preferred_price_max"),
    likedIds: text("liked_ids").array(),
    nopedIds: text("noped_ids").array(),
    feedbackNotes: text("feedback_notes").default("").notNull(), // 推薦用の好みメモ
    introStyle: text("intro_style").default("").notNull(), // 紹介スタイルメモ
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("user_preferences_user_id_idx").on(table.userId),
  }),
);

export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type NewUserPreferenceRow = typeof userPreferences.$inferInsert;

/**
 * spot_feedbacks テーブル（おすすめスポットに対するGood/Badフィードバック）。
 */
export const spotFeedbacks = pgTable(
  "spot_feedbacks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id").notNull(),
    spotId: text("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // "good" | "bad"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("spot_feedbacks_user_id_idx").on(table.userId),
    spotIdIdx: index("spot_feedbacks_spot_id_idx").on(table.spotId),
  }),
);

export type SpotFeedbackRow = typeof spotFeedbacks.$inferSelect;
export type NewSpotFeedbackRow = typeof spotFeedbacks.$inferInsert;

/**
 * es_sync_outbox テーブル（Elasticsearch 同期の再試行キュー）。
 *
 * PG への書き込み成功後に ES 反映が失敗した場合、ここに積んでバックグラウンドで再試行する。
 * 同一 spot_id の pending が既にある場合は最新の操作で上書きする（古い pending は破棄）。
 */
export const esSyncOutbox = pgTable(
  "es_sync_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    spotId: text("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    /** upsert | patch | delete */
    operation: text("operation").notNull(),
    /** upsert 時の embedding（PG では保持しないため outbox にのみ保存）。 */
    payload: jsonb("payload"),
    /** pending | completed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    pendingRetryIdx: index("es_sync_outbox_pending_retry_idx").on(table.status, table.nextRetryAt),
    spotIdIdx: index("es_sync_outbox_spot_id_idx").on(table.spotId),
  }),
);

export type EsSyncOutboxRow = typeof esSyncOutbox.$inferSelect;
export type NewEsSyncOutboxRow = typeof esSyncOutbox.$inferInsert;

/**
 * trip_feedbacks テーブル（旅行全体のフィードバック）。
 */
export const tripFeedbacks = pgTable(
  "trip_feedbacks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id").notNull(),
    rating: integer("rating").notNull(), // 星評価（1〜5）
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("trip_feedbacks_user_id_idx").on(table.userId),
  }),
);

export type TripFeedbackRow = typeof tripFeedbacks.$inferSelect;
export type NewTripFeedbackRow = typeof tripFeedbacks.$inferInsert;

/**
 * trip_plans テーブル（旅行プランとディベートログの履歴）。
 */
export const tripPlans = pgTable(
  "trip_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id").notNull(),
    origin: text("origin").notNull(),
    timeBudget: text("time_budget").notNull(),
    finalSpots: text("final_spots").array().notNull(),
    summary: text("summary").notNull(),
    debateLog: jsonb("debate_log").notNull(), // エージェント間のディベート会話ログ
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("trip_plans_user_id_idx").on(table.userId),
  }),
);

export type TripPlanRow = typeof tripPlans.$inferSelect;
export type NewTripPlanRow = typeof tripPlans.$inferInsert;

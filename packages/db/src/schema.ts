import { randomUUID } from "node:crypto";
import { doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * spots テーブル（観光スポットのマスターデータ）。
 *
 * search-core の `SpotDocument` に対応する元データを保持する。
 * Elasticsearch には検索用の写しを reindex で投入し、本テーブルが信頼できる正本とする。
 *
 * 設計メモ:
 *   - 緯度経度は `lat` / `lon` の2カラムで保持し、reindex 時に `{ lat, lon }` へ組み立てる。
 *   - `tags` は PostgreSQL の text[] で保持する。
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
    /** スポット名（全文検索の主対象）。 */
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
    /** タグ（例: ["寺", "世界遺産"]）。 */
    tags: text("tags").array(),
    /** 緯度。 */
    lat: doublePrecision("lat"),
    /** 経度。 */
    lon: doublePrecision("lon"),
    /** 参考価格（円）。 */
    price: integer("price"),
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
 * クーポン利用や「行った履歴」の保存に使う。パスワードは scrypt でハッシュ化して保持する。
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
 * coupons テーブル（スポットに紐づくクーポン）。
 *
 * 自治体が作成・削除し、観光者は画面で閲覧・利用する。
 * 利用回数は管理しない（何度でも使える）。検索（ES）対象ではなく DB のみで完結する。
 */
export const coupons = pgTable(
  "coupons",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** 対象スポット。スポット削除時にクーポンも削除する。 */
    spotId: text("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    /** 表示名（例: ドリンク10%OFF）。 */
    title: text("title").notNull(),
    /** 利用条件・備考。 */
    description: text("description"),
    /** 割引率（%）。5〜10 を想定。 */
    discountPercent: integer("discount_percent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    spotIdIdx: index("coupons_spot_id_idx").on(table.spotId),
  }),
);

export type CouponRow = typeof coupons.$inferSelect;
export type NewCouponRow = typeof coupons.$inferInsert;

/**
 * recommendations テーブル（自治体おすすめの近隣店）。
 *
 * 観光スポットの近くにある「お食事処」「お土産どころ」を自治体がキュレーションして紹介する。
 * 店名検索（Google Places / OSM）で name・address・緯度経度を自動入力し、
 * 自治体が type とおすすめコメントを付与する想定。検索（ES）対象ではなく DB のみで完結する。
 */
export const recommendations = pgTable(
  "recommendations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** 紐づく観光スポット。スポット削除時に一緒に削除する。 */
    spotId: text("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    /** 種別。"お食事処" | "お土産"。 */
    type: text("type").notNull(),
    /** 店名（Place lookup で自動入力）。 */
    name: text("name").notNull(),
    /** 住所（任意・自動入力）。 */
    address: text("address"),
    /** 緯度（任意・自動入力）。 */
    lat: doublePrecision("lat"),
    /** 経度（任意・自動入力）。 */
    lon: doublePrecision("lon"),
    /** 自治体のおすすめコメント（任意）。 */
    comment: text("comment"),
    /** 参考URL（食べログ/ホットペッパー等、任意）。 */
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    spotIdIdx: index("recommendations_spot_id_idx").on(table.spotId),
  }),
);

export type RecommendationRow = typeof recommendations.$inferSelect;
export type NewRecommendationRow = typeof recommendations.$inferInsert;

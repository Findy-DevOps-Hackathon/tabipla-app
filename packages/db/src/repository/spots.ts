import { and, arrayContains, asc, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { buildDestinationMatchClauses, NOTO_UMBRELLA_AREA } from "../destinationMatching.js";
import { type NewSpotRow, type SpotRow, spots } from "../schema.js";

/**
 * spots テーブルに対する基本的なデータアクセスを集約する。
 *
 * 検索ロジック（Elasticsearch）は持たず、あくまで PostgreSQL 上の正本データを扱う。
 * Elasticsearch への反映は reindex（backend-api 側）が search-core 経由で行う。
 */

/**
 * スポットを upsert する（同一 id があれば更新）。
 *
 * @returns 反映後の行
 */
export async function upsertSpot(db: Database, input: NewSpotRow): Promise<SpotRow> {
  const now = new Date();
  const [row] = await db
    .insert(spots)
    .values({ ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: spots.id,
      set: {
        municipalityId: sql`excluded.municipality_id`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        category: sql`excluded.category`,
        area: sql`excluded.area`,
        prefecture: sql`excluded.prefecture`,
        address: sql`excluded.address`,
        tags: sql`excluded.tags`,
        highlights: sql`excluded.highlights`,
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
        price: sql`excluded.price`,
        imageUrl: sql`excluded.image_url`,
        clusterId: sql`excluded.cluster_id`,
        sensoryScores: sql`excluded.sensory_scores`,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("[db] upsertSpot: 行の書き込みに失敗しました。");
  }
  return row;
}

/**
 * 複数スポットをまとめて upsert する。
 *
 * @returns 反映後の行配列
 */
export async function upsertSpots(db: Database, inputs: NewSpotRow[]): Promise<SpotRow[]> {
  if (inputs.length === 0) return [];
  const now = new Date();
  return db
    .insert(spots)
    .values(inputs.map((input) => ({ ...input, updatedAt: now })))
    .onConflictDoUpdate({
      target: spots.id,
      set: {
        municipalityId: sql`excluded.municipality_id`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        category: sql`excluded.category`,
        area: sql`excluded.area`,
        prefecture: sql`excluded.prefecture`,
        address: sql`excluded.address`,
        tags: sql`excluded.tags`,
        highlights: sql`excluded.highlights`,
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
        price: sql`excluded.price`,
        imageUrl: sql`excluded.image_url`,
        clusterId: sql`excluded.cluster_id`,
        sensoryScores: sql`excluded.sensory_scores`,
        updatedAt: now,
      },
    })
    .returning();
}

/** 管理画面向け一覧クエリのオプション。 */
export type SpotDestinationFilter = {
  area: string;
  prefecture: string;
};

/** 管理画面向け一覧クエリのオプション。 */
export type ListSpotsOptions = {
  q?: string;
  category?: string;
  prefecture?: string;
  area?: string;
  /** 複数エリア（area/prefecture の組）で絞り込む。指定時は prefecture/area は無視。 */
  destinations?: SpotDestinationFilter[];
  offset?: number;
  limit?: number;
  sort?: "updatedAt" | "name";
  order?: "asc" | "desc";
};

/**
 * 管理画面向けにスポット一覧を取得する（PostgreSQL 正本から）。
 */
export async function listSpots(
  db: Database,
  options: ListSpotsOptions = {},
): Promise<{ rows: SpotRow[]; total: number }> {
  const {
    q,
    category,
    prefecture,
    area,
    destinations,
    offset = 0,
    limit = 20,
    sort = "updatedAt",
    order = "desc",
  } = options;

  const conditions = [];
  if (category) conditions.push(arrayContains(spots.category, [category]));
  if (destinations?.length) {
    const destinationCondition = or(
      ...buildDestinationMatchClauses(destinations).map((clause) => {
        if (clause.legacyPrefectureOnly) {
          return and(
            eq(spots.prefecture, clause.prefecture),
            or(isNull(spots.area), eq(spots.area, ""), eq(spots.area, NOTO_UMBRELLA_AREA)),
          );
        }
        const base = and(eq(spots.area, clause.area), eq(spots.prefecture, clause.prefecture));
        if (clause.legacyAddressCity) {
          return and(base, ilike(spots.address, `%${clause.legacyAddressCity}%`));
        }
        return base;
      }),
    );
    if (destinationCondition) conditions.push(destinationCondition);
  } else {
    if (prefecture) conditions.push(eq(spots.prefecture, prefecture));
    if (area) conditions.push(eq(spots.area, area));
  }
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(spots.name, pattern),
        ilike(spots.description, pattern),
        ilike(spots.address, pattern),
        ilike(spots.area, pattern),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const orderBy =
    sort === "name"
      ? order === "asc"
        ? asc(spots.name)
        : desc(spots.name)
      : order === "asc"
        ? asc(spots.updatedAt)
        : desc(spots.updatedAt);

  const rows = await db
    .select()
    .from(spots)
    .where(where)
    .orderBy(orderBy)
    .offset(offset)
    .limit(limit);
  const [countRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(spots)
    .where(where);
  return { rows, total: countRow?.value ?? 0 };
}

/** id でスポットを1件取得する（無ければ undefined）。 */
export async function getSpotById(db: Database, id: string): Promise<SpotRow | undefined> {
  const [row] = await db.select().from(spots).where(eq(spots.id, id)).limit(1);
  return row;
}

/** id でスポットを削除する。 */
export async function deleteSpot(db: Database, id: string): Promise<void> {
  await db.delete(spots).where(eq(spots.id, id));
}

/** スポット総件数を返す。 */
export async function countSpots(db: Database): Promise<number> {
  const [row] = await db.select({ value: sql<number>`count(*)::int` }).from(spots);
  return row?.value ?? 0;
}

/**
 * id 昇順でスポットをページングしながら取得する（reindex 用のキーセットページング）。
 *
 * 大量データでも一定メモリで全件処理できるよう、`afterId` を起点に `batchSize` 件ずつ返す。
 *
 * @param afterId このIDより大きいものを取得（先頭は undefined）
 * @param batchSize 取得件数
 */
export async function listSpotsAfter(
  db: Database,
  afterId: string | undefined,
  batchSize: number,
): Promise<SpotRow[]> {
  const base = db.select().from(spots);
  const query =
    afterId === undefined
      ? base.orderBy(asc(spots.id)).limit(batchSize)
      : base.where(gt(spots.id, afterId)).orderBy(asc(spots.id)).limit(batchSize);
  return query;
}

/**
 * 全スポットをバッチ単位で順に処理する（reindex のための非同期イテレータ）。
 *
 * @example
 * for await (const batch of iterateAllSpots(db, 500)) {
 *   await bulkIndexDocuments(es, batch.map(toSpotDocument));
 * }
 */
export async function* iterateAllSpots(
  db: Database,
  batchSize = 500,
): AsyncGenerator<SpotRow[], void, void> {
  let afterId: string | undefined;
  while (true) {
    const batch = await listSpotsAfter(db, afterId, batchSize);
    if (batch.length === 0) return;
    yield batch;
    const last = batch[batch.length - 1];
    if (!last) return;
    afterId = last.id;
    if (batch.length < batchSize) return;
  }
}

import type { NewSpotRow, SpotRow } from "@tabipla/db";
import type { SpotDocument } from "@tabipla/search-core";

/**
 * PostgreSQL（正本）の行と、Elasticsearch 用の検索ドキュメントの相互変換。
 *
 * 正本は PostgreSQL（@tabipla/db の spots）。Elasticsearch はその写し。
 * backend-api は書き込みを必ず PG に行い、ES へは search-core 経由で反映する。
 */

/** 部分更新（PUT /spots/:id）の本文。id は変更不可。 */
export type SpotPatch = Partial<Omit<SpotDocument, "id">>;

const MAX_CATEGORIES = 3;

/** API / DB 向けにカテゴリ配列へ正規化する（最大3件、重複除去）。 */
export function normalizeCategories(value: string | string[] | null | undefined): string[] | null {
  if (value == null) return null;
  const arr = (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean);
  if (arr.length === 0) return null;
  return [...new Set(arr)].slice(0, MAX_CATEGORIES);
}

/**
 * DB の行（SpotRow）を検索ドキュメント（SpotDocument）へ変換する。
 *
 * - null は省略（undefined）へ正規化する。
 * - lat / lon が両方そろう場合のみ location を組み立てる。
 * - 日時は ISO 8601 文字列へ変換する。
 * - embedding はここでは付与しない（生成は別タスク。ES 側で管理）。
 */
export function toSpotDocument(row: SpotRow): SpotDocument {
  const location =
    row.lat !== null && row.lon !== null ? { lat: row.lat, lon: row.lon } : undefined;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ...(row.category !== null && row.category.length > 0 ? { category: row.category } : {}),
    ...(row.area !== null ? { area: row.area } : {}),
    ...(row.prefecture !== null ? { prefecture: row.prefecture } : {}),
    ...(row.address !== null ? { address: row.address } : {}),
    ...(row.tags !== null ? { tags: row.tags } : {}),
    ...(location ? { location } : {}),
    ...(row.price !== null ? { price: row.price } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 登録（POST /spots）の本文（SpotDocument）を DB 入力行（NewSpotRow）へ変換する。
 *
 * - location は lat / lon の2カラムへ分解する。
 * - embedding は DB では保持しない（ES 側の責務）ため捨てる。
 * - createdAt / updatedAt は DB 既定（now()）に委ねるため引き継がない。
 */
export function toNewSpotRow(doc: SpotDocument): NewSpotRow {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    category: normalizeCategories(doc.category),
    area: doc.area ?? null,
    prefecture: doc.prefecture ?? null,
    address: doc.address ?? null,
    tags: doc.tags ?? null,
    lat: doc.location?.lat ?? null,
    lon: doc.location?.lon ?? null,
    price: doc.price ?? null,
  };
}

/**
 * 既存行に部分更新（patch）を適用し、upsert 用の NewSpotRow を組み立てる。
 *
 * - patch に含まれないフィールドは既存値を維持する。
 * - location が指定された場合のみ lat / lon を更新する。
 * - id / createdAt は既存値を保持する（id は不変、createdAt は作成日時を維持）。
 */
export function mergeSpotRow(existing: SpotRow, patch: SpotPatch): NewSpotRow {
  return {
    id: existing.id,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    category:
      patch.category !== undefined ? normalizeCategories(patch.category) : existing.category,
    area: patch.area ?? existing.area,
    prefecture: patch.prefecture ?? existing.prefecture,
    address: patch.address ?? existing.address,
    tags: patch.tags ?? existing.tags,
    lat: patch.location ? patch.location.lat : existing.lat,
    lon: patch.location ? patch.location.lon : existing.lon,
    price: patch.price !== undefined ? patch.price : existing.price,
    createdAt: existing.createdAt,
  };
}

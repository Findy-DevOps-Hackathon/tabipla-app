import type { NewSpotRow, SpotRow } from "@tabipla/db";
import { resolveSpotArea } from "@tabipla/db";
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
 * - 日時は ISO 8601 文字列へ変換する。
 * - embedding はここでは付与しない（生成は別タスク。ES 側で管理）。
 */
export function toSpotDocument(row: SpotRow): SpotDocument {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ...(row.category !== null && row.category.length > 0 ? { category: row.category } : {}),
    ...(row.area !== null ? { area: row.area } : {}),
    ...(row.prefecture !== null ? { prefecture: row.prefecture } : {}),
    ...(row.address !== null ? { address: row.address } : {}),
    ...(row.highlights !== null ? { highlights: row.highlights } : {}),
    ...(row.imageUrl !== null ? { imageUrl: row.imageUrl } : {}),
    ...(row.clusterId !== null ? { clusterId: row.clusterId } : {}),
    ...(row.sensoryScores !== null
      ? { sensoryScores: row.sensoryScores as SpotDocument["sensoryScores"] }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 登録（POST /spots）の本文（SpotDocument）を DB 入力行（NewSpotRow）へ変換する。
 *
 * - embedding は DB では保持しない（ES 側の責務）ため捨てる。
 * - createdAt / updatedAt は DB 既定（now()）に委ねるため引き継がない。
 */
export function toNewSpotRow(doc: SpotDocument): NewSpotRow {
  const prefecture = doc.prefecture ?? null;
  const area = resolveSpotArea(doc.area, doc.address, prefecture);
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    category: normalizeCategories(doc.category),
    area,
    prefecture,
    address: doc.address ?? null,
    highlights: doc.highlights ?? null,
    imageUrl: doc.imageUrl ?? null,
    clusterId: doc.clusterId ?? null,
    sensoryScores: doc.sensoryScores ?? null,
  };
}

/**
 * 既存行に部分更新（patch）を適用し、upsert 用の NewSpotRow を組み立てる。
 *
 * - patch に含まれないフィールドは既存値を維持する。
 * - id / createdAt は既存値を保持する（id は不変、createdAt は作成日時を維持）。
 */
export function mergeSpotRow(existing: SpotRow, patch: SpotPatch): NewSpotRow {
  const prefecture = patch.prefecture ?? existing.prefecture;
  const address = patch.address ?? existing.address;
  const area = resolveSpotArea(
    patch.area !== undefined ? patch.area : existing.area,
    address,
    prefecture,
  );
  return {
    id: existing.id,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    category:
      patch.category !== undefined ? normalizeCategories(patch.category) : existing.category,
    area,
    prefecture,
    address,
    highlights: patch.highlights ?? existing.highlights,
    imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
    clusterId: patch.clusterId !== undefined ? patch.clusterId : existing.clusterId,
    sensoryScores: patch.sensoryScores !== undefined ? patch.sensoryScores : existing.sensoryScores,
    createdAt: existing.createdAt,
  };
}

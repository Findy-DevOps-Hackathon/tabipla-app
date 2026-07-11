import type { SpotRow } from "@tabipla/db";
import { toAgentCategory } from "@tabipla/domain";

export { toAgentCategory };

/** PostgreSQL の行を agent personalized 用カタログへ変換する。 */
export function toAgentCatalogSpot(row: SpotRow) {
  const primaryCategory = row.category?.[0] ?? "歴史・文化";
  return {
    id: row.id,
    name: row.name,
    category: toAgentCategory(primaryCategory),
    description: row.description,
    highlights: row.highlights ?? [],
  };
}

/** agent の personalized/plan レスポンス1件を DB 行で enrich する。 */
export function enrichRecommendation(rec: Record<string, unknown>, row: SpotRow | undefined) {
  if (!row) return rec;

  return {
    ...rec,
    id: row.id,
    name: row.name,
    category: toAgentCategory(row.category?.[0] ?? ""),
    description: row.description,
    highlights: row.highlights ?? [],
    prefecture: row.prefecture ?? "長野県",
    area: row.area ?? "小諸市",
    address: row.address ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
  };
}

import type { SpotRow } from "@tabipla/db";

/** agent の Spot.category（nature / gourmet / history）へ変換する。 */
export function toAgentCategory(adminCategory: string): string {
  if (adminCategory === "自然") return "nature";
  if (adminCategory === "食") return "gourmet";
  if (adminCategory === "歴史・文化") return "history";
  if (/グルメ|食/.test(adminCategory)) return "gourmet";
  if (/自然|高原|絶景/.test(adminCategory)) return "nature";
  if (/歴史|文化|遺産|神社|城/.test(adminCategory)) return "history";
  return "history";
}

/** DB の price（円）を agent の priceLevel（0–4）へざっくり変換する。 */
export function toPriceLevel(price: number | null): number {
  if (price == null || price <= 0) return 1;
  if (price < 500) return 0;
  if (price < 1500) return 1;
  if (price < 3000) return 2;
  if (price < 5000) return 3;
  return 4;
}

/** PostgreSQL の行を agent personalized 用カタログへ変換する。 */
export function toAgentCatalogSpot(row: SpotRow) {
  const primaryCategory = row.category?.[0] ?? "歴史・文化";
  return {
    id: row.id,
    name: row.name,
    category: toAgentCategory(primaryCategory),
    location: {
      lat: row.lat ?? 36.326,
      lon: row.lon ?? 138.423,
    },
    priceLevel: toPriceLevel(row.price),
    description: row.description,
    tags: row.tags ?? [],
  };
}

/** agent の personalized/plan レスポンス1件を DB 行で enrich する。 */
export function enrichRecommendation(
  rec: Record<string, unknown>,
  row: SpotRow | undefined,
) {
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
    tags: row.tags?.length ? row.tags : rec.tags,
    imageUrl: row.imageUrl ?? undefined,
  };
}

import type { Recommendation, SpotCategory, SwipeSpot } from "../data/spots.ts";
import type { SpotDocument } from "../types.ts";
import { API_BASE, DESTINATION_AREA, DESTINATION_PREFECTURE } from "../config.ts";

/** 管理画面カテゴリ → user-web 表示用バッジカテゴリ。 */
const ADMIN_TO_DISPLAY: Record<string, SpotCategory> = {
  自然: "自然",
  "歴史・文化": "歴史",
  食: "グルメ",
  都市: "観光",
  芸術: "観光",
  "レジャー・スポーツ": "観光",
  イベント: "観光",
  ショッピング: "観光",
};

/** agent の category（nature/gourmet/history）→ user-web 表示用。 */
const AGENT_TO_DISPLAY: Record<string, SpotCategory> = {
  nature: "自然",
  gourmet: "グルメ",
  history: "歴史",
};

function normalizeCategories(value?: string | string[]): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean);
}

/** SpotDocument のカテゴリを user-web 表示用に変換する。 */
export function displayCategory(doc: Pick<SpotDocument, "category">): SpotCategory {
  for (const c of normalizeCategories(doc.category)) {
    if (ADMIN_TO_DISPLAY[c]) return ADMIN_TO_DISPLAY[c];
  }
  return "観光";
}

/** agent レスポンスの category を user-web 表示用に変換する。 */
export function displayCategoryFromAgent(category?: string): SpotCategory {
  if (!category) return "観光";
  if (AGENT_TO_DISPLAY[category]) return AGENT_TO_DISPLAY[category];
  if (ADMIN_TO_DISPLAY[category]) return ADMIN_TO_DISPLAY[category];
  return "観光";
}

/** スポット画像 URL（DB に画像があればそれを、なければ agent SVG 生成）。 */
export function spotImageUrl(doc: Pick<SpotDocument, "id" | "imageUrl">): string {
  if (doc.imageUrl) {
    if (doc.imageUrl.startsWith("http://") || doc.imageUrl.startsWith("https://")) {
      return doc.imageUrl;
    }
    return `${API_BASE}${doc.imageUrl.startsWith("/") ? doc.imageUrl : `/${doc.imageUrl}`}`;
  }
  return `${API_BASE}/img/${encodeURIComponent(doc.id)}`;
}

/** SpotDocument → スワイプ用スポット。 */
export function documentToSwipeSpot(doc: SpotDocument): SwipeSpot {
  return {
    id: doc.id,
    name: doc.name,
    prefecture: doc.prefecture ?? DESTINATION_PREFECTURE,
    area: doc.area ?? DESTINATION_AREA,
    category: displayCategory(doc),
    description: doc.description,
    highlights: doc.highlights ?? [],
    tags: doc.tags ?? [],
    image: spotImageUrl(doc),
  };
}

/** SpotDocument → おすすめ一覧用（診断前の探索表示）。 */
export function documentToRecommendation(doc: SpotDocument): Recommendation {
  return {
    ...documentToSwipeSpot(doc),
    reason: "",
    match: 0,
    memberOnly: false,
  };
}

/** プラン API レスポンス1件 → Recommendation。 */
export function planItemToRecommendation(item: {
  id: string;
  name: string;
  category?: string;
  description?: string;
  highlights?: string[];
  prefecture?: string;
  area?: string;
  tags?: string[];
  why?: string[];
  score?: number;
  memberOnly?: boolean;
  image?: string;
  imageUrl?: string;
}): Recommendation | null {
  if (item.area && item.area !== DESTINATION_AREA) return null;
  if (item.prefecture && item.prefecture !== DESTINATION_PREFECTURE) return null;

  return {
    id: item.id,
    name: item.name,
    prefecture: item.prefecture ?? DESTINATION_PREFECTURE,
    area: item.area ?? DESTINATION_AREA,
    category: displayCategoryFromAgent(item.category),
    description: item.description ?? "",
    highlights: item.highlights ?? [],
    tags: item.tags ?? [],
    reason: (item.why ?? []).join(" / "),
    match: Math.round((item.score ?? 0.8) * 100),
    memberOnly: item.memberOnly ?? false,
    image: item.image || spotImageUrl({ id: item.id, imageUrl: item.imageUrl }),
  };
}

/** スワイプ比較カード用の短いプレビュー文。 */
export function spotPreviewText(spot: Pick<SwipeSpot, "highlights" | "trivia" | "description">): string {
  const firstHighlight = spot.highlights?.find(Boolean);
  if (firstHighlight) return firstHighlight;
  if (spot.trivia) {
    const end = spot.trivia.indexOf("。");
    return end === -1 ? spot.trivia : spot.trivia.slice(0, end + 1);
  }
  const end = spot.description.indexOf("。");
  return end === -1 ? spot.description : spot.description.slice(0, end + 1);
}

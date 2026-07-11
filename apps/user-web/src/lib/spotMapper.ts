import { API_BASE } from "../config.ts";
import type { Recommendation, SpotCategory, SwipeSpot } from "../data/spots.ts";
import type { SpotDocument } from "../types.ts";
import {
  getCurrentDestination,
  getCurrentDestinations,
  isDestinationSpot,
  type TripDestination,
} from "./destination.ts";
import { isDisplayableSpot } from "./spotCompleteness.ts";

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

/** 画像未設定時の中立プレースホルダー（実在風景の代用にしない）。 */
export const SPOT_IMAGE_PLACEHOLDER = "/spots/placeholder.svg";

/** スポット画像 URL（DB に画像があればそれを、なければ中立プレースホルダー）。 */
export function spotImageUrl(doc: Pick<SpotDocument, "id" | "imageUrl">): string {
  if (doc.imageUrl) {
    if (doc.imageUrl.startsWith("http://") || doc.imageUrl.startsWith("https://")) {
      return doc.imageUrl;
    }
    return `${API_BASE}${doc.imageUrl.startsWith("/") ? doc.imageUrl : `/${doc.imageUrl}`}`;
  }
  return SPOT_IMAGE_PLACEHOLDER;
}

/** SpotDocument → スワイプ用スポット。 */
export function documentToSwipeSpot(
  doc: SpotDocument,
  dest: TripDestination = getCurrentDestination(),
): SwipeSpot {
  return {
    id: doc.id,
    name: doc.name,
    prefecture: doc.prefecture ?? dest.prefecture,
    area: doc.area ?? dest.area,
    category: displayCategory(doc),
    description: doc.description,
    highlights: doc.highlights ?? [],
    image: spotImageUrl(doc),
  };
}

/** SpotDocument → おすすめ一覧用（診断前の探索表示）。 */
export function documentToRecommendation(
  doc: SpotDocument,
  dest: TripDestination = getCurrentDestination(),
): Recommendation {
  return {
    ...documentToSwipeSpot(doc, dest),
    reason: "",
    match: 0,
    memberOnly: false,
  };
}

/** プラン API レスポンス1件 → Recommendation。 */
export function planItemToRecommendation(
  item: {
    id: string;
    name: string;
    category?: string;
    description?: string;
    highlights?: string[];
    prefecture?: string;
    area?: string;
    score?: number;
    image?: string;
    imageUrl?: string;
    address?: string;
  },
  destinations: TripDestination[] = getCurrentDestinations(),
): Recommendation | null {
  if (item.area && item.prefecture) {
    if (
      !isDestinationSpot(
        { area: item.area, prefecture: item.prefecture, address: item.address },
        destinations,
      )
    ) {
      return null;
    }
  }

  if (
    !isDisplayableSpot({
      name: item.name,
      description: item.description,
      address: item.address,
      imageUrl: item.imageUrl ?? item.image,
      category: item.category,
      highlights: item.highlights,
    })
  ) {
    return null;
  }

  const dest =
    destinations.find(
      (candidate) => item.area === candidate.area && item.prefecture === candidate.prefecture,
    ) ?? getCurrentDestination();

  return {
    id: item.id,
    name: item.name,
    prefecture: item.prefecture ?? dest.prefecture,
    area: item.area ?? dest.area,
    category: displayCategoryFromAgent(item.category),
    description: item.description ?? "",
    highlights: item.highlights ?? [],
    reason: "",
    match: Math.round((item.score ?? 0.8) * 100),
    memberOnly: false,
    image:
      item.imageUrl != null && item.imageUrl !== ""
        ? spotImageUrl({ id: item.id, imageUrl: item.imageUrl })
        : item.image?.trim()
          ? item.image
          : SPOT_IMAGE_PLACEHOLDER,
  };
}

/** スワイプ比較カード用の短いプレビュー文。 */
export function spotPreviewText(
  spot: Pick<SwipeSpot, "highlights" | "trivia" | "description">,
): string {
  const firstHighlight = spot.highlights?.find(Boolean);
  if (firstHighlight) return firstHighlight;
  if (spot.trivia) {
    const end = spot.trivia.indexOf("。");
    return end === -1 ? spot.trivia : spot.trivia.slice(0, end + 1);
  }
  const end = spot.description.indexOf("。");
  return end === -1 ? spot.description : spot.description.slice(0, end + 1);
}

import { API_BASE } from "../config.ts";

/** 画像未設定時の中立プレースホルダー（実在風景の代用にしない）。 */
export const SPOT_IMAGE_PLACEHOLDER = "/spots/placeholder.svg";

/** 管理画面・一覧で表示するスポット画像 URL。 */
export function resolveSpotImageSrc(spot: { id: string; imageUrl?: string }): string | null {
  if (spot.imageUrl) {
    if (spot.imageUrl.startsWith("http://") || spot.imageUrl.startsWith("https://")) {
      return spot.imageUrl;
    }
    return `${API_BASE}${spot.imageUrl.startsWith("/") ? spot.imageUrl : `/${spot.imageUrl}`}`;
  }
  return null;
}

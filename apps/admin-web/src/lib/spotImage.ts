import { API_BASE } from "../config.ts";

/** 管理画面・一覧で表示するスポット画像 URL。未設定時は生成 SVG にフォールバック。 */
export function resolveSpotImageSrc(spot: { id: string; imageUrl?: string }): string {
  if (spot.imageUrl) {
    if (spot.imageUrl.startsWith("http://") || spot.imageUrl.startsWith("https://")) {
      return spot.imageUrl;
    }
    return `${API_BASE}${spot.imageUrl.startsWith("/") ? spot.imageUrl : `/${spot.imageUrl}`}`;
  }
  return `${API_BASE}/img/${encodeURIComponent(spot.id)}`;
}

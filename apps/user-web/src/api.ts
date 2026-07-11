import { API_BASE } from "./config.ts";
import {
  encodeDestinationsQuery,
  getCurrentDestinations,
  isDestinationSpot,
  type TripDestination,
} from "./lib/destination.ts";
import { isDisplayableDocument } from "./lib/spotCompleteness.ts";
import type { SpotDocument } from "./types.ts";

/**
 * backend-api への HTTP クライアント。
 *
 * - 開発時は Vite の dev server が `/api` を backend-api へプロキシする（vite.config.ts）。
 * - 本番: 未設定のまま `/api`（Firebase Hosting が `/api/**` を Cloud Run へ rewrite）
 */

/** backend-api がエラー時に返す JSON 形（{ error, ... }）。 */
type ApiErrorBody = {
  error?: string;
};

async function parseApiError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new Error(body?.error ?? `リクエストに失敗しました（HTTP ${res.status}）。`);
}

export type FetchSpotsParams = {
  prefecture?: string;
  area?: string;
  destinations?: TripDestination[];
  limit?: number;
  offset?: number;
  q?: string;
  signal?: AbortSignal;
};

type PublicSpotsResponse = {
  total: number;
  count: number;
  spots: SpotDocument[];
};

/** ユーザー向け公開スポット一覧（GET /v1/spots）。 */
export async function fetchPublicSpots(params: FetchSpotsParams = {}): Promise<SpotDocument[]> {
  const destinations = params.destinations ?? getCurrentDestinations();
  const search = new URLSearchParams();

  if (destinations.length > 0) {
    search.set("destinations", encodeDestinationsQuery(destinations));
  } else {
    search.set("prefecture", params.prefecture ?? "長野県");
    search.set("area", params.area ?? "小諸市");
  }

  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.q) search.set("q", params.q);

  const res = await fetch(`${API_BASE}/v1/spots?${search.toString()}`, {
    headers: { accept: "application/json" },
    signal: params.signal,
  });

  if (!res.ok) await parseApiError(res);
  const data = (await res.json()) as PublicSpotsResponse;
  const filterDestinations =
    params.destinations ??
    (params.area && params.prefecture
      ? [{ area: params.area, prefecture: params.prefecture }]
      : destinations);
  return (data.spots ?? [])
    .filter((spot) => isDestinationSpot(spot, filterDestinations))
    .filter(isDisplayableDocument);
}

type SpotDetailResponse = {
  spot: SpotDocument;
};

/** スポット1件取得（GET /v1/spots/:id）。 */
export async function fetchSpotById(id: string, signal?: AbortSignal): Promise<SpotDocument> {
  const res = await fetch(`${API_BASE}/v1/spots/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" },
    signal,
  });

  if (!res.ok) await parseApiError(res);
  const data = (await res.json()) as SpotDetailResponse;
  if (!isDestinationSpot(data.spot)) {
    throw new Error("スポットが見つかりません。");
  }
  if (!isDisplayableDocument(data.spot)) {
    throw new Error("スポットが見つかりません。");
  }
  return data.spot;
}

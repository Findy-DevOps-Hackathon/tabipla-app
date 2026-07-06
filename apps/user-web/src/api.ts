import type { SearchMode, SearchResponse, SpotDocument } from "./types.ts";
import { API_BASE } from "./config.ts";
import {
  decodeDestinationsQuery,
  encodeDestinationsQuery,
  getCurrentDestinations,
  isDestinationSpot,
  type TripDestination,
} from "./lib/destination.ts";

/**
 * backend-api への検索リクエストを担う薄いクライアント。
 *
 * - 開発時は Vite の dev server が `/api` を backend-api へプロキシする（vite.config.ts）。
 * - 本番: 未設定のまま `/api`（Firebase Hosting が `/api/**` を Cloud Run へ rewrite）
 * - フロントは Elasticsearch / search-core に直接触れず、必ずこの HTTP 経由で検索する。
 */

export type SearchParams = {
  query: string;
  mode?: SearchMode;
  size?: number;
  from?: number;
  signal?: AbortSignal;
};

/** backend-api がエラー時に返す JSON 形（{ error, ... }）。 */
type ApiErrorBody = {
  error?: string;
};

async function parseApiError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new Error(body?.error ?? `検索に失敗しました（HTTP ${res.status}）。`);
}

export async function searchSpots(params: SearchParams): Promise<SearchResponse> {
  const mode = params.mode ?? "hybrid";

  if (mode === "keyword") {
    const search = new URLSearchParams();
    search.set("q", params.query);
    if (params.size !== undefined) search.set("size", String(params.size));
    if (params.from !== undefined) search.set("from", String(params.from));

    const res = await fetch(`${API_BASE}/search?${search.toString()}`, {
      headers: { accept: "application/json" },
      signal: params.signal,
    });

    if (!res.ok) await parseApiError(res);
    return (await res.json()) as SearchResponse;
  }

  const semanticMode = mode === "vector" ? "vector" : "hybrid";
  const res = await fetch(`${API_BASE}/search/semantic`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: params.query,
      mode: semanticMode,
      size: params.size ?? 30,
    }),
    signal: params.signal,
  });

  if (!res.ok) await parseApiError(res);
  return (await res.json()) as SearchResponse;
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
  return (data.spots ?? []).filter((spot) => isDestinationSpot(spot, filterDestinations));
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
  return data.spot;
}

export { decodeDestinationsQuery, encodeDestinationsQuery };

import type { Coupon, CouponWithSpot, Recommendation, SearchMode, SearchResponse } from "./types.ts";

/**
 * backend-api への検索リクエストを担う薄いクライアント。
 *
 * - 開発時は Vite の dev server が `/api` を backend-api へプロキシする（vite.config.ts）。
 * - フロントは Elasticsearch / search-core に直接触れず、必ずこの HTTP 経由で検索する。
 */
const API_BASE = "/api";

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
  // 既定はキーワード + Embedding のハイブリッド検索。
  // 「探す」では表記ゆれや言い換えにも強くしたいため keyword 単独ではなく hybrid を既定にする。
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

export async function getCoupons(spotId: string, signal?: AbortSignal): Promise<Coupon[]> {
  const res = await fetch(`${API_BASE}/coupons?spotId=${encodeURIComponent(spotId)}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) return [];
  return (await res.json()) as Coupon[];
}

export async function getAllCoupons(signal?: AbortSignal): Promise<CouponWithSpot[]> {
  const res = await fetch(`${API_BASE}/coupons/list`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) return [];
  return (await res.json()) as CouponWithSpot[];
}

export async function getRecommendations(
  spotId: string,
  signal?: AbortSignal,
): Promise<Recommendation[]> {
  const res = await fetch(`${API_BASE}/recommendations?spotId=${encodeURIComponent(spotId)}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) return [];
  return (await res.json()) as Recommendation[];
}

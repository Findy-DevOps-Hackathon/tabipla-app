import type { SearchResponse } from "./types.ts";

/**
 * backend-api への検索リクエストを担う薄いクライアント。
 *
 * - 開発時は Vite の dev server が `/api` を backend-api へプロキシする（vite.config.ts）。
 * - フロントは Elasticsearch / search-core に直接触れず、必ずこの HTTP 経由で検索する。
 */
const API_BASE = "/api";

export type SearchParams = {
  query: string;
  size?: number;
  from?: number;
  signal?: AbortSignal;
};

/** backend-api がエラー時に返す JSON 形（{ error, ... }）。 */
type ApiErrorBody = {
  error?: string;
};

export async function searchSpots(
  params: SearchParams,
): Promise<SearchResponse> {
  const search = new URLSearchParams();
  search.set("q", params.query);
  if (params.size !== undefined) search.set("size", String(params.size));
  if (params.from !== undefined) search.set("from", String(params.from));

  const res = await fetch(`${API_BASE}/search?${search.toString()}`, {
    headers: { accept: "application/json" },
    signal: params.signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(
      body?.error ?? `検索に失敗しました（HTTP ${res.status}）。`,
    );
  }

  return (await res.json()) as SearchResponse;
}

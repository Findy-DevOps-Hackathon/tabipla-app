import { getAuthToken, logout } from "./auth.ts";
import { AGENT_BASE, API_BASE } from "./config.ts";
import type { BulkImportResponse, Spot, SpotListResponse } from "./types.ts";

const BASE = API_BASE;

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null && init.body !== "";
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(authHeaders())) {
    headers.set(key, value);
  }
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (res.status === 401) {
    logout();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API エラー (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    municipalityName?: string;
  };
};

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  if (!text.startsWith("{")) {
    throw new Error(
      "API に接続できません。ローカル開発では backend-api の起動と seed を確認してください。Firebase 公開版では API 未接続のためログインできません。",
    );
  }
  const body = JSON.parse(text) as LoginResponse | { error?: string };
  if (!res.ok) {
    throw new Error(body && "error" in body && body.error ? body.error : `API エラー (${res.status})`);
  }
  return body as LoginResponse;
}

export type ListSpotsParams = {
  q?: string;
  category?: string;
  prefecture?: string;
  offset?: number;
  limit?: number;
};

export async function listSpots(params: ListSpotsParams = {}): Promise<SpotListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.prefecture) qs.set("prefecture", params.prefecture);
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return request<SpotListResponse>(`/spots${query ? `?${query}` : ""}`);
}

export async function getSpot(id: string): Promise<Spot> {
  return request<Spot>(`/spots/${encodeURIComponent(id)}`);
}

export async function createSpot(spot: Spot): Promise<Spot> {
  return request<Spot>("/spots?refresh=true", {
    method: "POST",
    body: JSON.stringify(spot),
  });
}

export async function updateSpot(id: string, patch: Partial<Omit<Spot, "id">>): Promise<Spot> {
  return request<Spot>(`/spots/${encodeURIComponent(id)}?refresh=true`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deleteSpot(id: string): Promise<void> {
  await request(`/spots/${encodeURIComponent(id)}?refresh=true`, { method: "DELETE" });
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("ファイルの読み込みに失敗しました"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("ファイルの読み込みに失敗しました"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

export const SPOT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const SPOT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** スポット画像ファイルを pendingImage 用の Base64 に変換する。 */
export async function readSpotImageFile(
  file: File,
): Promise<{ mimeType: string; data: string }> {
  if (!SPOT_IMAGE_ACCEPT.split(",").includes(file.type)) {
    throw new Error("JPEG / PNG / WebP のみアップロードできます。");
  }
  if (file.size > SPOT_IMAGE_MAX_BYTES) {
    throw new Error("画像サイズは 5MB 以下にしてください。");
  }
  const data = await readFileAsBase64(file);
  return { mimeType: file.type, data };
}

/** スポット画像をアップロードする。 */
export async function uploadSpotImage(spotId: string, file: File): Promise<Spot> {
  const data = await readFileAsBase64(file);
  return request<Spot>(`/spots/${encodeURIComponent(spotId)}/image?refresh=true`, {
    method: "POST",
    body: JSON.stringify({ mimeType: file.type, data }),
  });
}

/** スポット画像を削除する。 */
export async function deleteSpotImage(spotId: string): Promise<Spot> {
  return request<Spot>(`/spots/${encodeURIComponent(spotId)}/image?refresh=true`, {
    method: "DELETE",
  });
}

export async function bulkImportSpots(spots: Spot[]): Promise<BulkImportResponse> {
  return request<BulkImportResponse>("/spots/bulk?refresh=true", {
    method: "POST",
    body: JSON.stringify({ spots }),
  });
}

export type CollectedSpotPayload = {
  name: string;
  description: string;
  highlights: string[];
  category: string;
  area: string;
  prefecture: string;
  address: string;
  tags: string[];
};

export type CollectSpotsParams = {
  municipality: string;
  prefecture: string;
  targetCount: number;
  categories: string[];
  excludeNames: string[];
};

/** AI 収集: 指定自治体の観光地を agent 経由で Web から収集する。 */
export async function collectSpots(params: CollectSpotsParams): Promise<CollectedSpotPayload[]> {
  const res = await fetch(`${AGENT_BASE}/v1/collect-spots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => null)) as
    | { spots?: CollectedSpotPayload[]; error?: string }
    | null;
  if (!res.ok || !body || "error" in body) {
    throw new Error(body && "error" in body && body.error ? body.error : `HTTP ${res.status}`);
  }
  return body.spots ?? [];
}

export type PlaceLookupResult = {
  name?: string;
  address?: string;
  lat: number;
  lon: number;
  category?: string | string[];
  description?: string;
};

export async function lookupPlaceByName(
  name: string,
  params: { prefecture?: string; municipality?: string } = {},
): Promise<PlaceLookupResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const qs = new URLSearchParams({ name: trimmed });
  if (params.prefecture) qs.set("prefecture", params.prefecture);
  if (params.municipality) qs.set("municipality", params.municipality);

  try {
    return await request<PlaceLookupResult>(`/places/lookup?${qs}`);
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    return await request<{ lat: number; lon: number }>(`/geocode?${new URLSearchParams({ q })}`);
  } catch {
    return null;
  }
}

export type DescribeSpotMode = "description" | "highlights";

export type DescribeSpotResult = {
  description?: string;
  category?: string;
  highlights?: string[];
};

export type GenerateSpotImageParams = {
  name: string;
  prefecture: string;
  municipality: string;
  description?: string;
  highlights?: string[];
  category?: string | string[];
  tags?: string[];
};

export type GenerateSpotImageResult = {
  mimeType: string;
  data: string;
  prompt?: string;
};

function base64ToFile(base64: string, mimeType: string, filename: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}

/** Base64 画像をスポットにアップロードする。 */
export async function uploadSpotImageBase64(
  spotId: string,
  mimeType: string,
  data: string,
): Promise<Spot> {
  return request<Spot>(`/spots/${encodeURIComponent(spotId)}/image?refresh=true`, {
    method: "POST",
    body: JSON.stringify({ mimeType, data }),
  });
}

/** スケッチ風観光イラストを agent 経由で生成する（16:11 WebP）。 */
export async function generateSpotImage(
  params: GenerateSpotImageParams,
): Promise<GenerateSpotImageResult> {
  const name = params.name.trim();
  if (!name) throw new Error("観光地名を入力してください");

  const res = await fetch(`${AGENT_BASE}/v1/generate-spot-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      prefecture: params.prefecture,
      municipality: params.municipality,
      description: params.description?.trim() || undefined,
      highlights: params.highlights,
      category: params.category,
      tags: params.tags,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | GenerateSpotImageResult
    | { error?: string }
    | null;
  if (!res.ok || !body || !("mimeType" in body) || !body.mimeType || !body.data) {
    throw new Error(
      body && "error" in body && body.error ? body.error : `HTTP ${res.status}`,
    );
  }
  return body;
}

/** 生成画像を File に変換する。 */
export function spotImageResultToFile(result: GenerateSpotImageResult, spotName: string): File {
  const ext = result.mimeType === "image/webp" ? "webp" : result.mimeType === "image/png" ? "png" : "jpg";
  return base64ToFile(result.data, result.mimeType, `${spotName}.${ext}`);
}

/** 個別登録向け: 指定自治体内の観光地について AI で紹介文またはおすすめポイントを生成する。 */
export async function generateSpotContent(
  params: {
    name: string;
    prefecture: string;
    municipality: string;
    address?: string;
  },
  mode: DescribeSpotMode,
): Promise<DescribeSpotResult | null> {
  const name = params.name.trim();
  if (!name) return null;

  try {
    const res = await fetch(`${AGENT_BASE}/v1/describe-spot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        prefecture: params.prefecture,
        municipality: params.municipality,
        address: params.address?.trim() || undefined,
        mode,
      }),
    });
    const body = (await res.json().catch(() => null)) as DescribeSpotResult | { error?: string } | null;
    if (!res.ok || !body || "error" in body) return null;
    if (mode === "description" && !("description" in body && body.description)) return null;
    if (mode === "highlights" && !("highlights" in body && body.highlights?.length)) return null;
    return body as DescribeSpotResult;
  } catch {
    return null;
  }
}

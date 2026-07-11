import { getAuthToken, logout } from "./auth.ts";
import { API_BASE } from "./config.ts";
import { resolveSpotImageSrc } from "./lib/spotImage.ts";
import {
  convertSpotImageFileToWebp,
  SPOT_IMAGE_ACCEPT,
  SPOT_IMAGE_MAX_BYTES,
  SPOT_IMAGE_OUTPUT_MIME,
} from "./lib/spotImageCrop.ts";
import type { BulkImportResponse, Spot, SpotListResponse } from "./types.ts";

export { SPOT_IMAGE_ACCEPT, SPOT_IMAGE_MAX_BYTES };

const BASE = API_BASE;
const API_REQUEST_TIMEOUT_MS = 30_000;
const AGENT_REQUEST_TIMEOUT_MS = 240_000;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonAuthHeaders(): HeadersInit {
  return { ...authHeaders(), "Content-Type": "application/json" };
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

  const res = await fetchWithTimeout(`${BASE}${path}`, {
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

function handleUnauthorized(res: Response): void {
  if (res.status === 401) {
    logout();
  }
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
  const res = await fetchWithTimeout(`${BASE}/auth/login`, {
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
    throw new Error(
      body && "error" in body && body.error ? body.error : `API エラー (${res.status})`,
    );
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

/** スポット画像ファイルを pendingImage 用の Base64 に変換する。 */
export async function readSpotImageFile(file: File): Promise<{ mimeType: string; data: string }> {
  const webpFile = await convertSpotImageFileToWebp(file);
  const data = await readFileAsBase64(webpFile);
  return { mimeType: SPOT_IMAGE_OUTPUT_MIME, data };
}

function spotImageMimeToExtension(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

function blobToSpotImageFile(blob: Blob, fileName: string): File {
  const mimeType = blob.type || "image/jpeg";
  if (!SPOT_IMAGE_ACCEPT.split(",").includes(mimeType)) {
    throw new Error("JPEG / PNG / WebP のみアップロードできます。");
  }
  if (blob.size > SPOT_IMAGE_MAX_BYTES) {
    throw new Error("画像サイズは 5MB 以下にしてください。");
  }
  const ext = spotImageMimeToExtension(mimeType);
  const baseName = fileName.replace(/\.[^.]+$/, "") || "spot";
  return new File([blob], `${baseName}.${ext}`, { type: mimeType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("画像の読み込みに失敗しました"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("画像の読み込みに失敗しました"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}

/** Base64 画像をトリミング用 File に変換する。 */
export function spotImageBase64ToFile(mimeType: string, data: string, fileName = "spot"): File {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return blobToSpotImageFile(new Blob([bytes], { type: mimeType }), fileName);
}

async function fetchSpotImageBlob(params: { imageUrl: string; spotId?: string }): Promise<Blob> {
  const cleanUrl = params.imageUrl.split("?")[0]?.trim();
  if (!cleanUrl) {
    throw new Error("画像 URL が不正です");
  }

  const src = resolveSpotImageSrc({ id: params.spotId ?? "preview", imageUrl: cleanUrl });
  if (!src) {
    throw new Error("画像 URL が不正です");
  }

  const headers = new Headers(authHeaders());
  const res = await fetchWithTimeout(src, { headers, cache: "no-store" }, IMAGE_FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error("画像の取得に失敗しました");
  }

  return res.blob();
}

/** 表示中のスポット画像をトリミング用 File として取得する。 */
export async function fetchSpotImageAsFile(params: {
  pendingFile?: File | null;
  imageUrl?: string;
  spotId?: string;
  fileName?: string;
}): Promise<File | undefined> {
  if (params.pendingFile) {
    return params.pendingFile;
  }

  const cleanUrl = params.imageUrl?.split("?")[0]?.trim();
  if (!cleanUrl) return undefined;

  const blob = await fetchSpotImageBlob({ imageUrl: cleanUrl, spotId: params.spotId });
  return blobToSpotImageFile(blob, params.fileName ?? "spot");
}

/** イラスト生成用に、アップロード済み画像を referenceImage 形式で取得する。 */
export async function resolveReferenceImageForGenerate(params: {
  pendingFile?: File | null;
  imageUrl?: string;
  spotId?: string;
}): Promise<{ mimeType: string; data: string } | undefined> {
  if (params.pendingFile) {
    return readSpotImageFile(params.pendingFile);
  }

  const cleanUrl = params.imageUrl?.split("?")[0]?.trim();
  if (!cleanUrl) return undefined;

  const blob = await fetchSpotImageBlob({ imageUrl: cleanUrl, spotId: params.spotId });
  const mimeType = blob.type || "image/jpeg";
  if (!SPOT_IMAGE_ACCEPT.split(",").includes(mimeType)) {
    throw new Error("JPEG / PNG / WebP のみアップロードできます。");
  }
  if (blob.size > SPOT_IMAGE_MAX_BYTES) {
    throw new Error("画像サイズは 5MB 以下にしてください。");
  }

  const data = await blobToBase64(blob);
  return { mimeType, data };
}

/** スポット画像をアップロードする。 */
export async function uploadSpotImage(spotId: string, file: File): Promise<Spot> {
  const webpFile = await convertSpotImageFileToWebp(file);
  const data = await readFileAsBase64(webpFile);
  return request<Spot>(`/spots/${encodeURIComponent(spotId)}/image?refresh=true`, {
    method: "POST",
    body: JSON.stringify({ mimeType: SPOT_IMAGE_OUTPUT_MIME, data }),
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
};

export type CollectSpotsParams = {
  municipality: string;
  prefecture: string;
  targetCount: number;
  categories: string[];
  excludeNames: string[];
};

/** AI 収集: 指定自治体の観光地を backend-api 経由で Web から収集する。 */
export async function collectSpots(params: CollectSpotsParams): Promise<CollectedSpotPayload[]> {
  const res = await fetchWithTimeout(
    `${BASE}/v1/collect-spots`,
    {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(params),
    },
    AGENT_REQUEST_TIMEOUT_MS,
  );
  handleUnauthorized(res);
  const body = (await res.json().catch(() => null)) as {
    spots?: CollectedSpotPayload[];
    error?: string;
  } | null;
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
  address?: string;
  /** アップロード済み写真を参考にイラスト化する場合に指定 */
  referenceImage?: { mimeType: string; data: string };
  /** 指定時はキャンセル可能（タイムアウトと併用） */
  signal?: AbortSignal;
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
  const payload =
    mimeType === SPOT_IMAGE_OUTPUT_MIME
      ? { mimeType, data }
      : await readSpotImageFile(spotImageBase64ToFile(mimeType, data));
  return request<Spot>(`/spots/${encodeURIComponent(spotId)}/image?refresh=true`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** fetch の AbortError（ユーザーによるキャンセル）かどうか。 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && error.name === "AbortError";
}

/** スケッチ風観光イラストを backend-api 経由で生成する（16:11 WebP）。 */
export async function generateSpotImage(
  params: GenerateSpotImageParams,
): Promise<GenerateSpotImageResult> {
  const name = params.name.trim() || (params.referenceImage ? "観光スポット" : "");
  if (!name) throw new Error("観光地名を入力してください");

  const timeoutSignal = AbortSignal.timeout(AGENT_REQUEST_TIMEOUT_MS);
  const signal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal;

  const res = await fetchWithTimeout(
    `${BASE}/v1/generate-spot-image`,
    {
      method: "POST",
      headers: jsonAuthHeaders(),
      cache: "no-store",
      signal,
      body: JSON.stringify({
        name,
        prefecture: params.prefecture,
        municipality: params.municipality,
        address: params.address?.trim() || undefined,
        referenceImage: params.referenceImage,
      }),
    },
    AGENT_REQUEST_TIMEOUT_MS,
  );
  const body = (await res.json().catch(() => null)) as
    | GenerateSpotImageResult
    | { error?: string }
    | null;
  if (!res.ok || !body || !("mimeType" in body) || !body.mimeType || !body.data) {
    throw new Error(body && "error" in body && body.error ? body.error : `HTTP ${res.status}`);
  }
  return body;
}

/** 生成画像を File に変換する。 */
export function spotImageResultToFile(result: GenerateSpotImageResult, spotName: string): File {
  const ext =
    result.mimeType === "image/webp" ? "webp" : result.mimeType === "image/png" ? "png" : "jpg";
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
    const res = await fetchWithTimeout(
      `${BASE}/v1/describe-spot`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          name,
          prefecture: params.prefecture,
          municipality: params.municipality,
          address: params.address?.trim() || undefined,
          mode,
        }),
      },
      AGENT_REQUEST_TIMEOUT_MS,
    );
    const body = (await res.json().catch(() => null)) as
      | DescribeSpotResult
      | { error?: string }
      | null;
    if (!res.ok || !body || "error" in body) return null;
    if (mode === "description" && !("description" in body && body.description)) return null;
    if (mode === "highlights" && !("highlights" in body && body.highlights?.length)) return null;
    return body as DescribeSpotResult;
  } catch {
    return null;
  }
}

import type { BulkImportResponse, Spot, SpotListResponse } from "./types.ts";
import { getAuthToken, logout } from "./auth.ts";

const BASE = "/api";

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
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
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

export async function bulkImportSpots(spots: Spot[]): Promise<BulkImportResponse> {
  return request<BulkImportResponse>("/spots/bulk?refresh=true", {
    method: "POST",
    body: JSON.stringify({ spots }),
  });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
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
    return await request<{ lat: number; lon: number }>(
      `/geocode?${new URLSearchParams({ q })}`,
    );
  } catch {
    return null;
  }
}

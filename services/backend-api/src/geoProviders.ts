import { fetchWithTimeout } from "./fetchWithTimeout.js";

const NOMINATIM_USER_AGENT = "tabipla-backend-api/0.1 (admin geocoding)";
const GEOCODING_TIMEOUT_MS = 12_000;

export type NominatimHit = {
  lat: number;
  lon: number;
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
};

type NominatimSearchOptions = {
  viewbox?: string;
  bounded?: boolean;
  limit?: number;
};

export async function searchNominatim(
  q: string,
  options: NominatimSearchOptions = {},
): Promise<NominatimHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: "json",
    limit: String(options.limit ?? 5),
    countrycodes: "jp",
  });
  if (options.viewbox) params.set("viewbox", options.viewbox);
  if (options.bounded) params.set("bounded", "1");

  const res = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    },
    GEOCODING_TIMEOUT_MS,
  );
  if (!res.ok) return [];

  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    name?: string;
    display_name?: string;
    class?: string;
    type?: string;
  }>;

  return data.flatMap((hit) => {
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [
      {
        lat,
        lon,
        name: hit.name,
        display_name: hit.display_name,
        class: hit.class,
        type: hit.type,
      },
    ];
  });
}

export function getGoogleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

export async function geocodeViaGoogle(
  q: string,
  key: string,
): Promise<{ lat: number; lon: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", key);

  const res = await fetchWithTimeout(url, {}, GEOCODING_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };

  // Google は HTTP 200 でも status で失敗を返す（REQUEST_DENIED / OVER_QUERY_LIMIT 等）。
  // 黙って Nominatim にフォールバックすると設定ミス（キー制限・API未有効化・課金未設定）に
  // 気づけないため、ZERO_RESULTS 以外の異常系は警告ログを出す。
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn(
      `[geocode] Google Geocoding が失敗しました: ${data.status}${
        data.error_message ? ` - ${data.error_message}` : ""
      }`,
    );
    return null;
  }

  const lat = data.results?.[0]?.geometry?.location?.lat;
  const lon = data.results?.[0]?.geometry?.location?.lng;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

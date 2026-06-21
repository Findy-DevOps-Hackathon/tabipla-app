const NOMINATIM_USER_AGENT = "tabipla-backend-api/0.1 (admin geocoding)";

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

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });
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

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };

  const lat = data.results?.[0]?.geometry?.location?.lat;
  const lon = data.results?.[0]?.geometry?.location?.lng;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

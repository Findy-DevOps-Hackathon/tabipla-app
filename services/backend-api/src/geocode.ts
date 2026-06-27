import { geocodeViaGoogle, getGoogleMapsApiKey, searchNominatim } from "./geoProviders.js";

/**
 * 住所文字列をジオコーディングする（Google Geocoding → Nominatim）。
 */
export async function geocodeAddressQuery(q: string): Promise<{ lat: number; lon: number } | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;

  const key = getGoogleMapsApiKey();
  if (key) {
    const google = await geocodeViaGoogle(trimmed, key);
    if (google) return google;
  }

  const hits = await searchNominatim(trimmed, { limit: 1 });
  const hit = hits[0];
  if (!hit) return null;

  return { lat: hit.lat, lon: hit.lon };
}

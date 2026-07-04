import {
  geocodeViaGoogle,
  getGoogleMapsApiKey,
  type NominatimHit,
  searchNominatim,
} from "./geoProviders.js";

/** スポット名検索の結果（管理画面フォーム自動入力用） */
export type PlaceLookupResult = {
  name?: string;
  address?: string;
  lat: number;
  lon: number;
  category?: string;
  description?: string;
};

function mapGoogleTypesToCategory(types: string[] = []): string | undefined {
  const set = new Set(types);
  if (
    set.has("restaurant") ||
    set.has("cafe") ||
    set.has("bakery") ||
    set.has("meal_takeaway") ||
    set.has("food")
  ) {
    return "食";
  }
  if (set.has("park") || set.has("natural_feature") || set.has("campground")) return "自然";
  if (set.has("museum") || set.has("art_gallery")) return "芸術";
  if (
    set.has("church") ||
    set.has("hindu_temple") ||
    set.has("mosque") ||
    set.has("synagogue") ||
    set.has("place_of_worship")
  ) {
    return "歴史・文化";
  }
  if (set.has("historical_landmark") || set.has("monument")) return "歴史・文化";
  if (set.has("shopping_mall") || set.has("department_store") || set.has("store")) {
    return "ショッピング";
  }
  if (set.has("stadium") || set.has("amusement_park")) return "レジャー・スポーツ";
  if (set.has("tourist_attraction") || set.has("locality")) return "都市";
  return undefined;
}

async function lookupViaPlacesApiNew(
  query: string,
  key: string,
): Promise<PlaceLookupResult | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.location,places.types,places.editorialSummary",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 1,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      types?: string[];
      editorialSummary?: { text?: string };
    }>;
  };

  const place = data.places?.[0];
  if (!place) return null;

  const lat = place.location?.latitude;
  const lon = place.location?.longitude;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    name: place.displayName?.text,
    address: place.formattedAddress,
    lat,
    lon,
    category: mapGoogleTypesToCategory(place.types),
    description: place.editorialSummary?.text?.trim(),
  };
}

async function lookupViaFindPlace(query: string, key: string): Promise<PlaceLookupResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "formatted_address,name,geometry,types");
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", key);

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    candidates?: Array<{
      formatted_address?: string;
      name?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      types?: string[];
    }>;
  };

  const candidate = data.candidates?.[0];
  if (!candidate) return null;

  const lat = candidate.geometry?.location?.lat;
  const lon = candidate.geometry?.location?.lng;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    name: candidate.name,
    address: candidate.formatted_address,
    lat,
    lon,
    category: mapGoogleTypesToCategory(candidate.types),
  };
}

async function lookupViaGeocoding(query: string, key: string): Promise<PlaceLookupResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", key);

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      types?: string[];
    }>;
  };

  const result = data.results?.[0];
  if (!result) return null;

  const lat = result.geometry?.location?.lat;
  const lon = result.geometry?.location?.lng;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    address: result.formatted_address,
    lat,
    lon,
    category: mapGoogleTypesToCategory(result.types),
  };
}

async function lookupViaNominatim(
  name: string,
  context: { prefecture: string; municipality: string },
): Promise<PlaceLookupResult | null> {
  const queries = [
    `${name} ${context.municipality} ${context.prefecture}`,
    `${context.municipality} ${name}`,
    `${context.prefecture}${context.municipality}${name}`,
  ];

  for (const query of queries) {
    const hit = pickNominatimHit(await searchNominatim(query, { limit: 8 }), name, context);
    if (hit) return toPlaceLookupResult(hit, context);
  }

  const centerHits = await searchNominatim(`${context.prefecture}${context.municipality}`, {
    limit: 1,
  });
  const center = centerHits[0];
  if (center) {
    const delta = 0.12;
    const viewbox = [
      center.lon - delta,
      center.lat + delta,
      center.lon + delta,
      center.lat - delta,
    ].join(",");
    const hit = pickNominatimHit(
      await searchNominatim(name, { viewbox, bounded: true, limit: 8 }),
      name,
      context,
    );
    if (hit) return toPlaceLookupResult(hit, context);
  }

  const key = getGoogleMapsApiKey();
  if (key) {
    for (const query of queries) {
      const location = await geocodeViaGoogle(query, key);
      if (!location) continue;
      return {
        address: `${context.prefecture}${context.municipality}${name}`,
        lat: location.lat,
        lon: location.lon,
      };
    }
  }

  return null;
}

function pickNominatimHit(
  hits: NominatimHit[],
  name: string,
  context: { prefecture: string; municipality: string },
): NominatimHit | null {
  const normalizedName = name.trim();
  const inArea = hits.filter(
    (hit) =>
      hit.display_name?.includes(context.prefecture) &&
      hit.display_name.includes(context.municipality),
  );
  const candidates = inArea.length > 0 ? inArea : hits;

  return (
    candidates.find((hit) => hit.name === normalizedName) ??
    candidates.find((hit) => hit.name?.includes(normalizedName)) ??
    candidates.find((hit) => hit.display_name?.includes(normalizedName)) ??
    candidates[0] ??
    null
  );
}

function toPlaceLookupResult(
  hit: NominatimHit,
  context: { prefecture: string; municipality: string },
): PlaceLookupResult {
  return {
    name: hit.name,
    address: formatNominatimAddress(hit.display_name ?? "", context),
    lat: hit.lat,
    lon: hit.lon,
    category: mapOsmTypeToCategory(hit.class, hit.type),
  };
}

function formatNominatimAddress(
  displayName: string,
  context: { prefecture: string; municipality: string },
): string {
  const parts = displayName
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const prefIdx = parts.indexOf(context.prefecture);
  if (prefIdx < 0) return `${context.prefecture}${context.municipality}`;

  const detail = parts
    .slice(1, prefIdx)
    .filter((p) => p !== context.municipality && !/^\d{3}-?\d{4}$/.test(p))
    .join("");

  return `${context.prefecture}${context.municipality}${detail}`;
}

function mapOsmTypeToCategory(osmClass?: string, osmType?: string): string | undefined {
  if (osmClass === "amenity" && (osmType === "restaurant" || osmType === "cafe")) return "食";
  if (osmClass === "amenity" && osmType === "place_of_worship") return "歴史・文化";
  if (osmClass === "tourism" && osmType === "museum") return "芸術";
  if (osmClass === "tourism") return "都市";
  if (osmClass === "leisure" || osmClass === "natural") return "自然";
  if (osmClass === "historic") return "歴史・文化";
  if (osmClass === "shop") return "ショッピング";
  return undefined;
}

/**
 * スポット名 + 自治体コンテキストで Places / Geocoding / Nominatim を検索する。
 */
export async function lookupPlaceByName(
  name: string,
  context: { prefecture: string; municipality: string },
): Promise<PlaceLookupResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const query = `${trimmed} ${context.municipality} ${context.prefecture}`;
  const key = getGoogleMapsApiKey();

  if (key) {
    const googleResult =
      (await lookupViaPlacesApiNew(query, key)) ??
      (await lookupViaFindPlace(query, key)) ??
      (await lookupViaGeocoding(query, key));
    if (googleResult) return googleResult;
  }

  return lookupViaNominatim(trimmed, context);
}

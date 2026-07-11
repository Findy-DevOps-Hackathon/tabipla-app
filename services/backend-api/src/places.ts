import {
  extractNotoAreaFromAddress,
  NOTO_MUNICIPALITY_AREAS,
  NOTO_UMBRELLA_AREA,
} from "@tabipla/db";
import { fetchWithTimeout } from "./fetchWithTimeout.js";

type MunicipalityContext = { prefecture: string; municipality: string };
const GOOGLE_PLACES_TIMEOUT_MS = 12_000;

function getGoogleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

function isNotoRegionContext(context: MunicipalityContext): boolean {
  return (
    context.prefecture === "石川県" &&
    (context.municipality === NOTO_UMBRELLA_AREA ||
      (NOTO_MUNICIPALITY_AREAS as readonly string[]).includes(context.municipality))
  );
}

/** 住所が指定自治体内かどうか（都道府県・市区町村名の両方を含むか）。 */
function isAddressInMunicipality(
  address: string | undefined,
  context: MunicipalityContext,
): boolean {
  if (!address?.trim()) return false;
  const normalized = address.replace(/\s+/g, "");
  if (!normalized.includes(context.prefecture.replace(/\s+/g, ""))) return false;

  if (isNotoRegionContext(context)) {
    return extractNotoAreaFromAddress(normalized) !== "";
  }

  return normalized.includes(context.municipality);
}

/** スポット名検索の結果（管理画面フォーム自動入力用） */
export type PlaceLookupResult = {
  name?: string;
  address?: string;
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
  context: MunicipalityContext,
): Promise<PlaceLookupResult | null> {
  const res = await fetchWithTimeout(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.types,places.editorialSummary",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "ja",
        regionCode: "JP",
        maxResultCount: 5,
      }),
    },
    GOOGLE_PLACES_TIMEOUT_MS,
  );

  if (!res.ok) return null;

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      types?: string[];
      editorialSummary?: { text?: string };
    }>;
  };

  const place = data.places?.find((p) => isAddressInMunicipality(p.formattedAddress, context));
  if (!place) return null;

  return {
    name: place.displayName?.text,
    address: place.formattedAddress,
    category: mapGoogleTypesToCategory(place.types),
    description: place.editorialSummary?.text?.trim(),
  };
}

async function lookupViaFindPlace(
  query: string,
  key: string,
  context: MunicipalityContext,
): Promise<PlaceLookupResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "formatted_address,name,types");
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", key);

  const res = await fetchWithTimeout(url, {}, GOOGLE_PLACES_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    candidates?: Array<{
      formatted_address?: string;
      name?: string;
      types?: string[];
    }>;
  };

  const candidate = data.candidates?.find((c) =>
    isAddressInMunicipality(c.formatted_address, context),
  );
  if (!candidate) return null;

  return {
    name: candidate.name,
    address: candidate.formatted_address,
    category: mapGoogleTypesToCategory(candidate.types),
  };
}

/**
 * スポット名 + 自治体コンテキストで Google Places を検索する。
 */
export async function lookupPlaceByName(
  name: string,
  context: { prefecture: string; municipality: string },
): Promise<PlaceLookupResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const query = `${trimmed} ${context.municipality} ${context.prefecture}`;
  const key = getGoogleMapsApiKey();
  if (!key) return null;

  return (
    (await lookupViaPlacesApiNew(query, key, context)) ??
    (await lookupViaFindPlace(query, key, context))
  );
}

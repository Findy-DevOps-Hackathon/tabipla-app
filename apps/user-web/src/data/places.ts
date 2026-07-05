/**
 * 目的地入力のオートコンプリート用の実在地名データ。
 *
 * 全 47 都道府県と全国市区町村（約 1,900 件）を保持する。
 * データ本体は `places-data.json`（`pnpm generate:places` で再生成）。
 * `searchPlaces` で名称・読み・都道府県名のいずれかに前方/部分一致した候補を返す。
 */

import placesDataJson from "./places-data.json";

/** 実在地名の 1 件。`prefecture` が null のものは都道府県そのもの。 */
export type Place = {
  /** 表示名（例: 小諸市）。 */
  name: string;
  /** ひらがな読み（例: こもろし）。 */
  reading: string;
  /** 属する都道府県名（例: 長野県）。都道府県自体は null。 */
  prefecture: string | null;
};

type PlacesData = {
  prefectures: Array<[string, string]>;
  municipalities: Array<[string, string, string]>;
};

const placesData = placesDataJson as unknown as PlacesData;

/** 全地名（都道府県 + 市区町村）をフラットにした一覧。 */
export const PLACES: Place[] = [
  ...placesData.prefectures.map(([name, reading]) => ({ name, reading, prefecture: null })),
  ...placesData.municipalities.map(([name, reading, prefecture]) => ({
    name,
    reading,
    prefecture,
  })),
];

/**
 * 入力文字列に一致する実在地名を返す。
 * 名称・読み・都道府県名のいずれかに含まれていれば候補とし、
 * 前方一致を優先して並べる。
 */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = query.trim();
  if (q === "") return [];

  const matched = PLACES.filter(
    (p) => p.name.includes(q) || p.reading.includes(q) || (p.prefecture?.includes(q) ?? false),
  );

  return matched
    .sort((a, b) => {
      const aPrefix = a.name.startsWith(q) || a.reading.startsWith(q);
      const bPrefix = b.name.startsWith(q) || b.reading.startsWith(q);
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
      return a.name.length - b.name.length;
    })
    .slice(0, limit);
}

/** 現状対応している旅先の一覧。 */
export const AVAILABLE_DESTINATIONS: Place[] = [
  { name: "小諸市", reading: "こもろし", prefecture: "長野県" },
];

/** 都道府県ごとにグループ化した対応旅先。 */
export type DestinationPrefectureGroup = {
  prefecture: string;
  cities: Place[];
};

export function groupDestinationsByPrefecture(
  destinations: Place[] = AVAILABLE_DESTINATIONS,
): DestinationPrefectureGroup[] {
  const groups = new Map<string, Place[]>();

  for (const place of destinations) {
    const prefecture = place.prefecture ?? place.name;
    const cities = groups.get(prefecture) ?? [];
    cities.push(place);
    groups.set(prefecture, cities);
  }

  return [...groups.entries()].map(([prefecture, cities]) => ({ prefecture, cities }));
}

function matchesDestination(place: Place, query: string): boolean {
  return (
    place.name.includes(query) ||
    place.reading.includes(query) ||
    (place.prefecture?.includes(query) ?? false) ||
    query.includes("小諸") ||
    query.includes("こもろ") ||
    query.includes("長野") ||
    query.includes("ながの")
  );
}

/** 現状対応している旅先のみを返す。 */
export function searchDestinationPlaces(query: string): Place[] {
  const q = query.trim();
  if (q === "") return AVAILABLE_DESTINATIONS;
  return AVAILABLE_DESTINATIONS.filter((place) => matchesDestination(place, q));
}

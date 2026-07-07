/**
 * 目的地入力のオートコンプリート用の実在地名データ。
 *
 * 全 47 都道府県と全国市区町村（約 1,900 件）を保持する。
 * データ本体は `places-data.json`（`pnpm generate:places` で再生成）。
 * `searchPlaces` で名称・読み・都道府県名のいずれかに前方/部分一致した候補を返す。
 */

import type { TripDestination } from "../lib/destination.ts";
import {
  compressNotoSelectionLabels,
  NOTO_MUNICIPALITY_NAMES,
  NOTO_SUBREGIONS,
} from "./notoAreas.ts";
import placesDataJson from "./places-data.json";
import {
  compressToshinSelectionLabels,
  TOSHIN_MUNICIPALITY_NAMES,
  TOSHIN_SUBREGIONS,
} from "./toshinAreas.ts";

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

function pickPlaces(names: readonly string[]): Place[] {
  return names
    .map((name) => PLACES.find((place) => place.name === name && place.prefecture))
    .filter((place): place is Place & { prefecture: string } => Boolean(place));
}

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
  ...pickPlaces(TOSHIN_MUNICIPALITY_NAMES),
  ...pickPlaces(NOTO_MUNICIPALITY_NAMES),
];

/** 都道府県内の中間エリア（例: 能登半島）。 */
export type DestinationSubregionGroup = {
  name: string;
  cities: Place[];
};

/** 都道府県ごとにグループ化した対応旅先。 */
export type DestinationPrefectureGroup = {
  prefecture: string;
  /** 都道府県直下の市区町村（中間エリアに属さないもの）。 */
  cities: Place[];
  /** 都道府県内の中間エリア（石川県 → 能登半島 など）。 */
  subregions: DestinationSubregionGroup[];
};

const ISHIKAWA_PREFECTURE = "石川県";
const NAGANO_PREFECTURE = "長野県";

const PREFECTURE_SUBREGIONS: Record<
  string,
  readonly { name: string; municipalities: readonly string[] }[]
> = {
  [ISHIKAWA_PREFECTURE]: NOTO_SUBREGIONS,
  [NAGANO_PREFECTURE]: TOSHIN_SUBREGIONS,
};

function getRegionalMunicipalityNames(prefecture: string): readonly string[] {
  if (prefecture === ISHIKAWA_PREFECTURE) return NOTO_MUNICIPALITY_NAMES;
  if (prefecture === NAGANO_PREFECTURE) return TOSHIN_MUNICIPALITY_NAMES;
  return [];
}

export function groupDestinationsByPrefecture(
  destinations: Place[] = AVAILABLE_DESTINATIONS,
): DestinationPrefectureGroup[] {
  const groups = new Map<string, { regional: Place[]; direct: Place[] }>();

  for (const place of destinations) {
    const prefecture = place.prefecture ?? place.name;
    const bucket = groups.get(prefecture) ?? { regional: [], direct: [] };
    const regionalNames = getRegionalMunicipalityNames(prefecture);

    if (
      place.prefecture === prefecture &&
      (regionalNames as readonly string[]).includes(place.name)
    ) {
      bucket.regional.push(place);
    } else {
      bucket.direct.push(place);
    }

    groups.set(prefecture, bucket);
  }

  return [...groups.entries()].map(([prefecture, { regional, direct }]) => ({
    prefecture,
    cities: direct,
    subregions: (PREFECTURE_SUBREGIONS[prefecture] ?? [])
      .map((subregion) => ({
        name: subregion.name,
        cities: regional.filter((place) =>
          (subregion.municipalities as readonly string[]).includes(place.name),
        ),
      }))
      .filter((subregion) => subregion.cities.length > 0),
  }));
}

/** 市区町村名から旅先（area + prefecture）を解決する。 */
export function resolveTripDestination(area: string): TripDestination | null {
  const place = AVAILABLE_DESTINATIONS.find((candidate) => candidate.name === area);
  if (!place?.prefecture) return null;
  return { area: place.name, prefecture: place.prefecture };
}

/** 市区町村名から属する都道府県を返す。 */
export function getPrefectureForArea(area: string): string | null {
  return resolveTripDestination(area)?.prefecture ?? null;
}

/** 選択中の旅先が属する都道府県（未選択時は null）。 */
export function getSelectedPrefecture(selected: string[]): string | null {
  if (selected.length === 0) return null;
  return getPrefectureForArea(selected[0]!) ?? null;
}

/** 同一都道府県内でのみ複数選択できる市区町村トグル。 */
export function toggleDestinationSelection(selected: string[], area: string): string[] {
  const prefecture = getPrefectureForArea(area);
  if (!prefecture) return selected;

  if (selected.includes(area)) {
    return selected.filter((name) => name !== area);
  }

  const currentPrefecture = getSelectedPrefecture(selected);
  if (currentPrefecture && currentPrefecture !== prefecture) {
    return [area];
  }

  return [...selected, area];
}

/** user-web が対応している全市区町村の旅先一覧。 */
export function getAllSupportedDestinations(): TripDestination[] {
  return AVAILABLE_DESTINATIONS.filter((place): place is Place & { prefecture: string } =>
    Boolean(place.prefecture),
  ).map((place) => ({ area: place.name, prefecture: place.prefecture }));
}

/** 複数市区町村名から旅先一覧を解決する。 */
export function resolveTripDestinations(areas: string[]): TripDestination[] {
  return areas
    .map((area) => resolveTripDestination(area))
    .filter((dest): dest is TripDestination => dest !== null);
}

/** 中間エリア配下の市区町村がすべて選択されているか。 */
export function isSubregionFullySelected(
  selected: string[],
  cityNames: readonly string[],
): boolean {
  return cityNames.length > 0 && cityNames.every((name) => selected.includes(name));
}

/** 中間エリアの一括選択／解除（同一都道府県内のみ複数選択）。 */
export function toggleSubregionSelection(
  selected: string[],
  cityNames: readonly string[],
): string[] {
  if (cityNames.length === 0) return selected;

  const prefecture = getPrefectureForArea(cityNames[0]!);
  if (!prefecture) return selected;

  const citySet = new Set(cityNames);
  if (isSubregionFullySelected(selected, cityNames)) {
    return selected.filter((name) => !citySet.has(name));
  }

  const currentPrefecture = getSelectedPrefecture(selected);
  if (currentPrefecture && currentPrefecture !== prefecture) {
    return [...cityNames];
  }

  const without = selected.filter((name) => !citySet.has(name));
  return [...without, ...cityNames];
}

/** 選択ラベル用: サブリージョン一括選択時はリージョン名で表示。 */
export function formatDestinationSelectionLabel(selected: string[]): string {
  if (selected.length === 0) return "";

  const regionalSet = new Set<string>([
    ...(NOTO_MUNICIPALITY_NAMES as readonly string[]),
    ...(TOSHIN_MUNICIPALITY_NAMES as readonly string[]),
  ]);
  const others = selected.filter((name) => !regionalSet.has(name));
  const labels = [
    ...others,
    ...compressToshinSelectionLabels(selected),
    ...compressNotoSelectionLabels(selected),
  ];

  if (labels.length === 1) return `${labels[0]}で探す`;
  if (labels.length <= 3) return `${labels.join("・")}で探す`;
  return `${labels.length}件の旅先で探す`;
}

/** 現状対応している旅先のみを返す。 */
export function searchDestinationPlaces(query: string): Place[] {
  const q = query.trim();
  if (q === "") return AVAILABLE_DESTINATIONS;

  return AVAILABLE_DESTINATIONS.filter((place) => {
    if (
      place.name.includes(q) ||
      place.reading.includes(q) ||
      (place.prefecture?.includes(q) ?? false)
    ) {
      return true;
    }
    if ((q.includes("能登") || q.includes("のと")) && place.prefecture === ISHIKAWA_PREFECTURE) {
      return true;
    }
    if (
      (q.includes("東信") || q.includes("とうしん")) &&
      place.prefecture === NAGANO_PREFECTURE &&
      (TOSHIN_MUNICIPALITY_NAMES as readonly string[]).includes(place.name)
    ) {
      return true;
    }
    return false;
  });
}

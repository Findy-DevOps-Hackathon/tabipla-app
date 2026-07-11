import { isAreaListFullySelected } from "./areasCommon.js";

/** 能登半島の市区町村（石川県）。 */
export const NOTO_MUNICIPALITY_NAMES = [
  "七尾市",
  "輪島市",
  "珠洲市",
  "羽咋市",
  "志賀町",
  "宝達志水町",
  "中能登町",
  "穴水町",
  "能登町",
] as const;

/** @tabipla/db 互換エイリアス。 */
export const NOTO_MUNICIPALITY_AREAS = NOTO_MUNICIPALITY_NAMES;

/** 能登半島アカウントで登録されたスポットの umbrella エリア名（レガシー）。 */
export const NOTO_UMBRELLA_AREA = "能登半島";

/** 石川県公式区分: 能登北部（2市2町）。 */
export const NOTO_NORTHERN_AREA = "能登北部";

export const NOTO_NORTHERN_MUNICIPALITY_NAMES = ["輪島市", "珠洲市", "穴水町", "能登町"] as const;

/** 石川県公式区分: 能登中部（2市3町）。 */
export const NOTO_CENTRAL_AREA = "能登中部";

export const NOTO_CENTRAL_MUNICIPALITY_NAMES = [
  "七尾市",
  "羽咋市",
  "志賀町",
  "宝達志水町",
  "中能登町",
] as const;

export type NotoSubregion = {
  name: string;
  municipalities: readonly string[];
};

/** 旅先選択 UI 向けの能登サブリージョン（北→中の順）。 */
export const NOTO_SUBREGIONS: readonly NotoSubregion[] = [
  { name: NOTO_NORTHERN_AREA, municipalities: NOTO_NORTHERN_MUNICIPALITY_NAMES },
  { name: NOTO_CENTRAL_AREA, municipalities: NOTO_CENTRAL_MUNICIPALITY_NAMES },
];

const ISHIKAWA_PREFECTURE = "石川県";

export type TripDestinationLike = {
  area: string;
  prefecture: string;
};

/** @tabipla/db 互換エイリアス。 */
export type DestinationFilter = TripDestinationLike;

/** 能登の選択状態を表示ラベルに圧縮する（一括選択済みサブリージョン名を使用）。 */
export function compressNotoSelectionLabels(selectedAreas: readonly string[]): string[] {
  const notoSet = new Set(NOTO_MUNICIPALITY_NAMES as readonly string[]);
  const notoSelected = selectedAreas.filter((name) => notoSet.has(name));

  if (isAreaListFullySelected(notoSelected, NOTO_MUNICIPALITY_NAMES)) {
    return [NOTO_UMBRELLA_AREA];
  }

  const labels: string[] = [];
  const covered = new Set<string>();

  for (const subregion of NOTO_SUBREGIONS) {
    if (isAreaListFullySelected(notoSelected, subregion.municipalities)) {
      labels.push(subregion.name);
      for (const name of subregion.municipalities) covered.add(name);
    }
  }

  for (const name of notoSelected) {
    if (!covered.has(name)) labels.push(name);
  }

  return labels;
}

/** 石川県の能登市区町村かどうか。 */
export function isNotoMunicipality(area: string, prefecture: string): boolean {
  return (
    prefecture === ISHIKAWA_PREFECTURE &&
    (NOTO_MUNICIPALITY_NAMES as readonly string[]).includes(area)
  );
}

/** 住所文字列から能登の市区町村名を探す。 */
export function extractNotoAreaFromAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";
  for (const city of NOTO_MUNICIPALITY_NAMES) {
    if (trimmed.includes(city)) return city;
  }
  return "";
}

/** スポット名から能登の市区町村名を推定する。 */
export function inferNotoAreaFromName(name: string): string | null {
  let trimmed = name.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes("%")) trimmed = decodeURIComponent(trimmed);
  } catch {
    // decode 失敗時はそのまま
  }

  for (const city of NOTO_MUNICIPALITY_NAMES) {
    if (trimmed.includes(city)) return city;
    const stem = city.replace(/[市区町村]$/, "");
    if (stem.length >= 2 && trimmed.includes(stem)) return city;
  }

  if (trimmed.includes("すず") || trimmed.includes("珠洲")) return "珠洲市";
  if (trimmed.includes("のと") || trimmed.includes("能登")) return "能登町";

  return null;
}

/** 石川県の能登エリア向けスポットで area が未設定または umbrella のもの。 */
export function isIncompleteNotoSpot(spot: {
  area?: string | null;
  prefecture?: string | null;
}): boolean {
  if (spot.prefecture !== ISHIKAWA_PREFECTURE) return false;
  const area = spot.area?.trim() ?? "";
  return area === "" || area === NOTO_UMBRELLA_AREA;
}

/** スポットが選択中旅先に該当するか（市単位。レガシー umbrella は住所で判定）。 */
export function spotMatchesDestinations(
  spot: {
    area?: string | null;
    prefecture?: string | null;
    address?: string | null;
  },
  destinations: TripDestinationLike[],
): boolean {
  if (!spot.prefecture) return false;

  const area = spot.area?.trim() ?? "";
  const hasNotoDestination = destinations.some((dest) =>
    isNotoMunicipality(dest.area, dest.prefecture),
  );

  if (
    area &&
    destinations.some((dest) => area === dest.area && spot.prefecture === dest.prefecture)
  ) {
    return true;
  }

  if (hasNotoDestination && isIncompleteNotoSpot(spot)) {
    if (!area) return true;
    if (area === NOTO_UMBRELLA_AREA && !spot.address?.trim()) return true;
  }

  if (
    area === NOTO_UMBRELLA_AREA &&
    spot.prefecture === ISHIKAWA_PREFECTURE &&
    spot.address?.trim()
  ) {
    return destinations.some(
      (dest) => isNotoMunicipality(dest.area, dest.prefecture) && spot.address?.includes(dest.area),
    );
  }

  return false;
}

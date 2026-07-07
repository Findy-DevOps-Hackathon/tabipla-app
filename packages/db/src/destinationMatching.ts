/** 能登半島アカウントで登録されたスポットの umbrella エリア名（レガシー）。 */
export const NOTO_UMBRELLA_AREA = "能登半島";

/** user-web / admin-web が選択可能な能登半島の市区町村。 */
export const NOTO_MUNICIPALITY_AREAS = [
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

export type DestinationFilter = {
  area: string;
  prefecture: string;
};

const ISHIKAWA_PREFECTURE = "石川県";

/** 石川県の能登市区町村かどうか。 */
export function isNotoMunicipality(area: string, prefecture: string): boolean {
  return (
    prefecture === ISHIKAWA_PREFECTURE &&
    (NOTO_MUNICIPALITY_AREAS as readonly string[]).includes(area)
  );
}

/** 住所文字列から能登の市区町村名を探す。 */
export function extractNotoAreaFromAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";
  for (const city of NOTO_MUNICIPALITY_AREAS) {
    if (trimmed.includes(city)) return city;
  }
  return "";
}

/**
 * スポットの area を市区町村名へ正規化する。
 * レガシーの「能登半島」や未設定は住所から推定する。
 */
export function resolveSpotArea(
  area: string | null | undefined,
  address: string | null | undefined,
  prefecture: string | null | undefined,
): string | null {
  const trimmedArea = area?.trim() ?? "";
  const trimmedAddress = address?.trim() ?? "";

  if (trimmedAddress && prefecture === ISHIKAWA_PREFECTURE) {
    let rest = trimmedAddress;
    if (rest.startsWith(ISHIKAWA_PREFECTURE)) {
      rest = rest.slice(ISHIKAWA_PREFECTURE.length);
    }
    const match = rest.match(/^(.+?[市区町村])/);
    if (match?.[1] && isNotoMunicipality(match[1], ISHIKAWA_PREFECTURE)) {
      return match[1];
    }
    const fromScan = extractNotoAreaFromAddress(trimmedAddress);
    if (fromScan) return fromScan;
  }

  if (trimmedArea && trimmedArea !== NOTO_UMBRELLA_AREA) {
    return trimmedArea;
  }

  if (trimmedAddress && prefecture === ISHIKAWA_PREFECTURE) {
    const fromScan = extractNotoAreaFromAddress(trimmedAddress);
    if (fromScan) return fromScan;
  }

  return trimmedArea || null;
}

export type DestinationMatchClause = {
  area: string;
  prefecture: string;
  /** レガシー: area=能登半島 のスポットを住所に含まれる市区町村名で絞る */
  legacyAddressCity?: string;
  /** area 未設定・能登半島のみの石川県スポット（能登の旅先選択時に含める） */
  legacyPrefectureOnly?: boolean;
};

/** スポット名から能登の市区町村名を推定する（住所未入力データの補完用）。 */
export function inferNotoAreaFromName(name: string): string | null {
  let trimmed = name.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes("%")) trimmed = decodeURIComponent(trimmed);
  } catch {
    // decode 失敗時はそのまま
  }

  for (const city of NOTO_MUNICIPALITY_AREAS) {
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

/** listSpots 向け: 市ごとの OR 条件（レガシー umbrella は住所で絞る）。 */
export function buildDestinationMatchClauses(
  destinations: DestinationFilter[],
): DestinationMatchClause[] {
  const clauses: DestinationMatchClause[] = [];
  const seen = new Set<string>();

  for (const dest of destinations) {
    const exactKey = `${dest.prefecture}:${dest.area}`;
    if (!seen.has(exactKey)) {
      clauses.push({ area: dest.area, prefecture: dest.prefecture });
      seen.add(exactKey);
    }

    if (isNotoMunicipality(dest.area, dest.prefecture)) {
      const legacyKey = `${ISHIKAWA_PREFECTURE}:${NOTO_UMBRELLA_AREA}:${dest.area}`;
      if (!seen.has(legacyKey)) {
        clauses.push({
          area: NOTO_UMBRELLA_AREA,
          prefecture: ISHIKAWA_PREFECTURE,
          legacyAddressCity: dest.area,
        });
        seen.add(legacyKey);
      }
    }
  }

  if (destinations.some((dest) => isNotoMunicipality(dest.area, dest.prefecture))) {
    const incompleteKey = `${ISHIKAWA_PREFECTURE}:legacy-incomplete`;
    if (!seen.has(incompleteKey)) {
      clauses.push({
        area: "",
        prefecture: ISHIKAWA_PREFECTURE,
        legacyPrefectureOnly: true,
      });
      seen.add(incompleteKey);
    }
  }

  return clauses;
}

/** スポットが選択中旅先に該当するか（市単位。レガシー umbrella は住所で判定）。 */
export function spotMatchesDestinations(
  spot: {
    area: string | null;
    prefecture: string | null;
    address?: string | null;
  },
  destinations: DestinationFilter[],
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

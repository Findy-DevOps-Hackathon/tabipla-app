import {
  type DestinationFilter,
  extractNotoAreaFromAddress,
  inferNotoAreaFromName,
  isIncompleteNotoSpot,
  isNotoMunicipality,
  NOTO_MUNICIPALITY_AREAS,
  NOTO_UMBRELLA_AREA,
  spotMatchesDestinations,
} from "@tabipla/domain";

export {
  type DestinationFilter,
  extractNotoAreaFromAddress,
  inferNotoAreaFromName,
  isIncompleteNotoSpot,
  isNotoMunicipality,
  NOTO_MUNICIPALITY_AREAS,
  NOTO_UMBRELLA_AREA,
  spotMatchesDestinations,
};

const ISHIKAWA_PREFECTURE = "石川県";

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

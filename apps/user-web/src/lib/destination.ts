import type { SpotDocument } from "../types.ts";
import {
  compressNotoSelectionLabels,
  NOTO_MUNICIPALITY_NAMES,
  spotMatchesDestinations,
} from "../data/notoAreas.ts";
import { compressToshinSelectionLabels, TOSHIN_MUNICIPALITY_NAMES } from "../data/toshinAreas.ts";

export type TripDestination = {
  area: string;
  prefecture: string;
};

/** 未選択時の既定旅先（小諸市）。 */
export const DEFAULT_DESTINATION: TripDestination = {
  area: "小諸市",
  prefecture: "長野県",
};

const DESTINATION_KEY = "tabipla-destination";

function readStoredDestinations(): TripDestination[] {
  try {
    const raw = localStorage.getItem(DESTINATION_KEY);
    if (!raw) return [DEFAULT_DESTINATION];
    const parsed = JSON.parse(raw) as TripDestination | TripDestination[];
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((dest) => dest?.area && dest?.prefecture);
      return valid.length > 0 ? valid : [DEFAULT_DESTINATION];
    }
    if (parsed?.area && parsed?.prefecture) return [parsed];
  } catch {
    // localStorage 不可環境では既定値を使う。
  }
  return [DEFAULT_DESTINATION];
}

let currentDestinations = readStoredDestinations();

/** 現在選択中の旅先一覧。 */
export function getCurrentDestinations(): TripDestination[] {
  return currentDestinations;
}

/** 後方互換: 先頭の旅先を返す。 */
export function getCurrentDestination(): TripDestination {
  return currentDestinations[0] ?? DEFAULT_DESTINATION;
}

/** 旅先を更新する（目的地入力確定時）。 */
export function setCurrentDestinations(destinations: TripDestination[]): void {
  currentDestinations = destinations.length > 0 ? destinations : [DEFAULT_DESTINATION];
  try {
    localStorage.setItem(DESTINATION_KEY, JSON.stringify(currentDestinations));
  } catch {
    // localStorage 不可環境ではメモリ上のみ保持。
  }
}

/** 表示用ラベル（例: 東信 / 能登北部・七尾市 / 七尾市ほか2件）。 */
export function formatDestinationLabel(destinations: TripDestination[] = getCurrentDestinations()): string {
  if (destinations.length === 0) return DEFAULT_DESTINATION.area;

  const notoSet = new Set(NOTO_MUNICIPALITY_NAMES as readonly string[]);
  const toshinSet = new Set(TOSHIN_MUNICIPALITY_NAMES as readonly string[]);
  const others = destinations
    .filter(
      (dest) =>
        !(dest.prefecture === "石川県" && notoSet.has(dest.area)) &&
        !(dest.prefecture === "長野県" && toshinSet.has(dest.area)),
    )
    .map((dest) => dest.area);
  const notoAreas = destinations
    .filter((dest) => dest.prefecture === "石川県" && notoSet.has(dest.area))
    .map((dest) => dest.area);
  const toshinAreas = destinations
    .filter((dest) => dest.prefecture === "長野県" && toshinSet.has(dest.area))
    .map((dest) => dest.area);
  const labels = [
    ...others,
    ...compressToshinSelectionLabels(toshinAreas),
    ...compressNotoSelectionLabels(notoAreas),
  ];

  if (labels.length === 1) return labels[0] ?? DEFAULT_DESTINATION.area;
  if (labels.length <= 3) return labels.join("・");
  return `${labels[0]}ほか${labels.length - 1}件`;
}

/** 選択中旅先のスポットかどうか（能登は市単位で判定）。 */
export function isDestinationSpot(
  spot: Pick<SpotDocument, "area" | "prefecture" | "address">,
  destinations: TripDestination[] = getCurrentDestinations(),
): boolean {
  return spotMatchesDestinations(spot, destinations);
}

/** API クエリ用: area:prefecture をカンマ区切りでエンコード。 */
export function encodeDestinationsQuery(destinations: TripDestination[]): string {
  return destinations
    .map((dest) => `${encodeURIComponent(dest.area)}:${encodeURIComponent(dest.prefecture)}`)
    .join(",");
}

/** API クエリ用: encodeDestinationsQuery の逆。 */
export function decodeDestinationsQuery(value: string): TripDestination[] {
  return value
    .split(",")
    .map((pair) => {
      const [area, prefecture] = pair.split(":");
      if (!area || !prefecture) return null;
      return {
        area: decodeURIComponent(area),
        prefecture: decodeURIComponent(prefecture),
      };
    })
    .filter((dest): dest is TripDestination => dest !== null);
}

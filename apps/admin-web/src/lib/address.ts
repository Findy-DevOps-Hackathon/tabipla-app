import {
  extractNotoAreaFromAddress,
  inferNotoAreaFromName,
  NOTO_UMBRELLA_AREA,
} from "@tabipla/domain";
import { getMunicipality, type Prefecture } from "../master/index.ts";

/**
 * 住所文字列から市区町村（エリア）を抽出する。
 * 例: "長野県小諸市中央1丁目" → "小諸市"
 *
 * prefecture は全国どの都道府県でも受け付ける（Web収集は全国対応のため、
 * デフォルト値からの型推論に頼らず Prefecture で明示する）。
 */
export function extractAreaFromAddress(
  address: string,
  prefecture: Prefecture = getMunicipality().prefecture,
): string {
  const municipality = getMunicipality();
  const trimmed = address.trim();
  if (!trimmed) return "";

  let rest = trimmed;
  if (prefecture && rest.startsWith(prefecture)) {
    rest = rest.slice(prefecture.length);
  }

  const match = rest.match(/^(.+?[市区町村])/);
  if (match?.[1]) return match[1];

  if (prefecture === "石川県") {
    const notoCity = extractNotoAreaFromAddress(trimmed);
    if (notoCity) return notoCity;
  }

  if (municipality.name !== NOTO_UMBRELLA_AREA && trimmed.includes(municipality.name)) {
    return municipality.name;
  }

  if (municipality.name === NOTO_UMBRELLA_AREA) return "";
  return municipality.defaultArea;
}

/** 登録前に area を市区町村名へ正規化する（能登半島 umbrella は住所から推定）。 */
export function resolveSpotArea(
  area: string | undefined,
  address: string | undefined,
  prefecture: Prefecture = getMunicipality().prefecture,
  name?: string,
): string {
  const trimmedArea = area?.trim() ?? "";
  const trimmedAddress = address?.trim() ?? "";

  if (trimmedAddress) {
    const fromAddress = extractAreaFromAddress(trimmedAddress, prefecture);
    if (fromAddress && fromAddress !== NOTO_UMBRELLA_AREA) return fromAddress;
  }

  if (trimmedArea && trimmedArea !== NOTO_UMBRELLA_AREA) return trimmedArea;

  if (trimmedAddress && prefecture === "石川県") {
    const notoCity = extractNotoAreaFromAddress(trimmedAddress);
    if (notoCity) return notoCity;
  }

  if (prefecture === "石川県" && name?.trim()) {
    const inferred = inferNotoAreaFromName(name);
    if (inferred) return inferred;
  }

  const municipality = getMunicipality();
  if (municipality.name === NOTO_UMBRELLA_AREA) return trimmedArea;
  return trimmedArea || municipality.defaultArea;
}

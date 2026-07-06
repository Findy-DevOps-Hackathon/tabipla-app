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

export const NOTO_SUBREGIONS: readonly NotoSubregion[] = [
  { name: NOTO_NORTHERN_AREA, municipalities: NOTO_NORTHERN_MUNICIPALITY_NAMES },
  { name: NOTO_CENTRAL_AREA, municipalities: NOTO_CENTRAL_MUNICIPALITY_NAMES },
];

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

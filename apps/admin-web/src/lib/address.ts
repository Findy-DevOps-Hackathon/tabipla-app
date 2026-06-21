import { MUNICIPALITY } from "../master/index.ts";

/**
 * 住所文字列から市区町村（エリア）を抽出する。
 * 例: "長野県小諸市中央1丁目" → "小諸市"
 */
export function extractAreaFromAddress(
  address: string,
  prefecture = MUNICIPALITY.prefecture,
): string {
  const trimmed = address.trim();
  if (!trimmed) return "";

  let rest = trimmed;
  if (prefecture && rest.startsWith(prefecture)) {
    rest = rest.slice(prefecture.length);
  }

  const match = rest.match(/^(.+?[市区町村])/);
  if (match?.[1]) return match[1];

  if (trimmed.includes(MUNICIPALITY.name)) {
    return MUNICIPALITY.name;
  }

  return MUNICIPALITY.defaultArea;
}

import { MUNICIPALITY, type Prefecture } from "../master/index.ts";

/**
 * 住所文字列から市区町村（エリア）を抽出する。
 * 例: "長野県小諸市中央1丁目" → "小諸市"
 *
 * prefecture は全国どの都道府県でも受け付ける（Web収集は全国対応のため、
 * デフォルト値からの型推論に頼らず Prefecture で明示する）。
 */
export function extractAreaFromAddress(
  address: string,
  prefecture: Prefecture = MUNICIPALITY.prefecture,
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

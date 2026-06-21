export const MAX_SPOT_CATEGORIES = 3;

/** API の category（単一 or 配列）をフォーム用配列へ正規化する。 */
export function normalizeCategories(value?: string | string[]): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SPOT_CATEGORIES);
}

/** カテゴリ配列を CSV 用のセミコロン区切り文字列へ。 */
export function formatCategories(value?: string | string[]): string {
  return normalizeCategories(value).join(";");
}

/** 既存カテゴリに1件追加（最大3件・重複なし）。 */
export function addCategory(existing: string[], incoming: string): string[] {
  const trimmed = incoming.trim();
  if (!trimmed || existing.includes(trimmed) || existing.length >= MAX_SPOT_CATEGORIES) {
    return existing;
  }
  return [...existing, trimmed];
}

/** CSV 等のセミコロン区切り文字列を配列へ。 */
export function parseCategories(value: string): string[] {
  return normalizeCategories(value.split(";"));
}

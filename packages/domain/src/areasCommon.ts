/** 指定市区町村がすべて選択されているか。 */
export function isAreaListFullySelected(
  selected: readonly string[],
  cityNames: readonly string[],
): boolean {
  return cityNames.length > 0 && cityNames.every((name) => selected.includes(name));
}

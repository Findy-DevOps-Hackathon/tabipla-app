import { isAreaListFullySelected } from "./areasCommon.js";

/** 東信エリアの市区町村（長野県）。 */
export const TOSHIN_MUNICIPALITY_NAMES = ["小諸市"] as const;

/** 長野県東信地方のリージョン名。 */
export const TOSHIN_AREA = "東信";

export type ToshinSubregion = {
  name: string;
  municipalities: readonly string[];
};

/** 旅先選択 UI 向けの東信サブリージョン。 */
export const TOSHIN_SUBREGIONS: readonly ToshinSubregion[] = [
  { name: TOSHIN_AREA, municipalities: TOSHIN_MUNICIPALITY_NAMES },
];

/** 東信の選択状態を表示ラベルに圧縮する（一括選択済みなら「東信」）。 */
export function compressToshinSelectionLabels(selectedAreas: readonly string[]): string[] {
  const toshinSet = new Set(TOSHIN_MUNICIPALITY_NAMES as readonly string[]);
  const toshinSelected = selectedAreas.filter((name) => toshinSet.has(name));

  if (isAreaListFullySelected(toshinSelected, TOSHIN_MUNICIPALITY_NAMES)) {
    return [TOSHIN_AREA];
  }

  return [...toshinSelected];
}

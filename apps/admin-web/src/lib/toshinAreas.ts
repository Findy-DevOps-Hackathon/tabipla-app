/** 東信エリアの市区町村（長野県）。 */
export const TOSHIN_MUNICIPALITY_NAMES = ["小諸市", "東御市"] as const;

export const TOSHIN_AREA = "東信";

export type ToshinSubregion = {
  name: string;
  municipalities: readonly string[];
};

export const TOSHIN_SUBREGIONS: readonly ToshinSubregion[] = [
  { name: TOSHIN_AREA, municipalities: TOSHIN_MUNICIPALITY_NAMES },
];

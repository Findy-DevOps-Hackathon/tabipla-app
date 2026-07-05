import { DESTINATION_AREA, DESTINATION_PREFECTURE } from "../config.ts";
import type { SpotDocument } from "../types.ts";

/** 現状対応している旅先エリアのスポットかどうか。 */
export function isDestinationSpot(
  spot: Pick<SpotDocument, "area" | "prefecture">,
): boolean {
  return spot.area === DESTINATION_AREA && spot.prefecture === DESTINATION_PREFECTURE;
}

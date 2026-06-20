/**
 * @tabipla/maps-core 公開API
 *
 * 外部（agent-api 等）から利用する関数・型のみを export する。
 */

export type { ComputeRouteMatrixRequest, RouteMatrixElement } from "./client/routes.client.js";
export { resolveApiKey } from "./client/routes.client.js";
export { getTravelTimes, MAX_DESTINATIONS_DEFAULT } from "./getTravelTimes.js";
export type {
  LatLng,
  TravelLeg,
  TravelMode,
  TravelTimeMatrix,
  TravelTimesParams,
} from "./types/travelTimes.js";

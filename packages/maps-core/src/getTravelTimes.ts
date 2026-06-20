/**
 * A4: getTravelTimes（手段別移動時間・距離マトリクス）
 *
 * 拠点(origin) × 上位N件のスポット(destinations) × 移動手段(modes) の
 * 所要時間・距離を Google Maps Routes API で一括取得して返す。
 *
 * A5 推薦エージェントが FunctionTool として呼び出すことを想定している。
 */

import { computeRouteMatrix, type RouteMatrixElement } from "./client/routes.client.js";
import type {
  LatLng,
  TravelLeg,
  TravelMode,
  TravelTimeMatrix,
  TravelTimesParams,
} from "./types/travelTimes.js";

/** destinations の上限デフォルト値。Routes API の matrix 上限(625要素)以内で余裕を持たせる。 */
export const MAX_DESTINATIONS_DEFAULT = 25;

/**
 * Routes API の condition / status から TravelLeg.status を解決する。
 */
function resolveStatus(el: RouteMatrixElement): TravelLeg["status"] {
  if (el.condition === "ROUTE_NOT_FOUND") return "NOT_FOUND";
  if (el.status?.code !== undefined && el.status.code !== 0) {
    return "ZERO_RESULTS";
  }
  return "OK";
}

/**
 * "123s" 形式の duration 文字列から秒数を取り出す。
 * パース失敗時は null を返す。
 */
function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = /^(\d+)s$/.exec(duration);
  if (!match || match[1] === undefined) return null;
  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * 1手段分の RouteMatrixElement[] を TravelLeg[] に変換する。
 * destinations の数を基準に、結果が欠落している行は NOT_FOUND として補完する。
 */
function toTravelLegs(elements: RouteMatrixElement[], destinationCount: number): TravelLeg[] {
  const map = new Map<number, TravelLeg>();

  for (const el of elements) {
    const status = resolveStatus(el);
    const isOk = status === "OK";
    map.set(el.destinationIndex, {
      destinationIndex: el.destinationIndex,
      durationSeconds: isOk ? (parseDurationSeconds(el.duration) ?? null) : null,
      distanceMeters: isOk ? (el.distanceMeters ?? null) : null,
      status,
    });
  }

  return Array.from({ length: destinationCount }, (_, i) => {
    return (
      map.get(i) ?? {
        destinationIndex: i,
        durationSeconds: null,
        distanceMeters: null,
        status: "NOT_FOUND" as const,
      }
    );
  });
}

/**
 * 手段別の移動時間・距離マトリクスを返す（A4 コア関数）。
 *
 * 動作:
 *   - destinations が maxDestinations を超えた場合は先頭から切り捨てる（ログあり）。
 *   - 各移動手段について Routes API を個別に呼び出し、結果を統合する。
 *   - 到達不可・部分失敗は TravelLeg.status で表現し、呼び出し元に判断を委ねる。
 *   - 1手段の API 呼び出しが失敗した場合はその手段の結果を省略してエラーを再スローせず、
 *     他手段の結果は返す（部分成功を許容するデモ向け方針）。
 *     ※本番化の際はエラーポリシーを再検討すること。
 *
 * @throws destinations が空の場合、GOOGLE_MAPS_API_KEY 未設定の場合
 */
export async function getTravelTimes(params: TravelTimesParams): Promise<TravelTimeMatrix> {
  const {
    origin,
    modes = ["DRIVE"],
    departureTime,
    maxDestinations = MAX_DESTINATIONS_DEFAULT,
  } = params;

  if (params.destinations.length === 0) {
    throw new Error("[maps-core] getTravelTimes: destinations が空です。");
  }

  const destinations: LatLng[] =
    params.destinations.length > maxDestinations
      ? (() => {
          console.warn(
            `[maps-core] getTravelTimes: destinations (${params.destinations.length}件) が` +
              ` maxDestinations (${maxDestinations}) を超えています。先頭 ${maxDestinations} 件に切り捨てます。`,
          );
          return params.destinations.slice(0, maxDestinations);
        })()
      : params.destinations;

  const origins = [
    {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lon },
      },
    },
  ];

  const destWaypoints = destinations.map((d) => ({
    location: {
      latLng: { latitude: d.lat, longitude: d.lon },
    },
  }));

  const resultsByMode: Partial<Record<TravelMode, TravelLeg[]>> = {};

  await Promise.all(
    modes.map(async (mode) => {
      try {
        const elements: RouteMatrixElement[] = await computeRouteMatrix({
          origins,
          destinations: destWaypoints,
          travelMode: mode,
          ...(departureTime ? { departureTime } : {}),
          ...(mode === "DRIVE" ? { routingPreference: "TRAFFIC_AWARE" } : {}),
        });
        resultsByMode[mode] = toTravelLegs(elements, destinations.length);
      } catch (err) {
        console.error(
          `[maps-core] getTravelTimes: 移動手段 ${mode} の計算に失敗しました。` +
            " この手段の結果を省略します。",
          err,
        );
      }
    }),
  );

  return {
    origin,
    destinations,
    results: resultsByMode,
  };
}

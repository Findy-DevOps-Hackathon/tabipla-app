/**
 * Google Maps Routes API クライアント（computeRouteMatrix）
 *
 * 環境変数 GOOGLE_MAPS_API_KEY を使用して Routes API v2 を呼び出す薄いラッパ。
 * 認証情報の管理は呼び出し元（Secret Manager 等）の責務であり、
 * このモジュールはキーの取得と HTTP 通信のみを担う。
 */

import type { TravelMode } from "../types/travelTimes.js";

const ROUTES_API_BASE = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

/** Routes API の Waypoint 表現。 */
type RouteWaypoint = {
  location: {
    latLng: {
      latitude: number;
      longitude: number;
    };
  };
};

/** computeRouteMatrix リクエスト本体。 */
export type ComputeRouteMatrixRequest = {
  origins: RouteWaypoint[];
  destinations: RouteWaypoint[];
  travelMode: TravelMode;
  departureTime?: string;
  /**
   * Routes API のフィールドマスク。不要フィールドを省くことで課金要素を最小化する。
   * https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix
   */
  routingPreference?: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL";
};

/**
 * Routes API から返る1要素分の型（必要フィールドのみ）。
 * API は NDJSON（改行区切り JSON）で返すため、配列として受け取る。
 */
export type RouteMatrixElement = {
  originIndex: number;
  destinationIndex: number;
  status?: {
    code?: number;
    message?: string;
  };
  condition?: "ROUTE_EXISTS" | "ROUTE_NOT_FOUND";
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
};

/**
 * 環境変数から GOOGLE_MAPS_API_KEY を取得する。
 * キーが未設定の場合はエラーをスローする（握りつぶさない）。
 */
export function resolveApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      "[maps-core] GOOGLE_MAPS_API_KEY が設定されていません。" +
        " .env または Secret Manager で設定してください。",
    );
  }
  return key;
}

/**
 * Google Maps Routes API の computeRouteMatrix を呼び出す。
 *
 * - API キーは resolveApiKey() で取得する。
 * - フィールドマスクは duration / distanceMeters / condition / status のみ指定し
 *   不要な課金フィールドを除外する。
 * - レスポンスは NDJSON 形式のため行ごとにパースする。
 *
 * @throws GOOGLE_MAPS_API_KEY 未設定時、HTTP エラー時
 */
export async function computeRouteMatrix(
  request: ComputeRouteMatrixRequest,
): Promise<RouteMatrixElement[]> {
  const apiKey = resolveApiKey();

  const fieldMask = [
    "originIndex",
    "destinationIndex",
    "status",
    "condition",
    "distanceMeters",
    "duration",
  ].join(",");

  const res = await fetch(`${ROUTES_API_BASE}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      origins: request.origins,
      destinations: request.destinations,
      travelMode: request.travelMode,
      ...(request.departureTime ? { departureTime: request.departureTime } : {}),
      ...(request.routingPreference ? { routingPreference: request.routingPreference } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`[maps-core] Routes API エラー (${res.status} ${res.statusText}): ${body}`);
  }

  const text = await res.text();
  return parseNdjson(text);
}

/**
 * Routes API が返す NDJSON（改行区切り JSON）をパースして配列に変換する。
 * 空行はスキップし、パース失敗行はエラーをスローする（握りつぶさない）。
 */
function parseNdjson(text: string): RouteMatrixElement[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line) as RouteMatrixElement;
      } catch (_e) {
        throw new Error(
          `[maps-core] Routes API NDJSON のパースに失敗しました (行 ${i + 1}): ${line}`,
        );
      }
    });
}

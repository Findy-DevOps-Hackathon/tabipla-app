/**
 * ブラウザの Geolocation API で現在地を取得し、エリア名（市区町村など）へ変換する。
 *
 * 逆ジオコーディングには OpenStreetMap Nominatim の公開 API を使う（APIキー不要）。
 * backend-api に位置情報 → エリア名の変換エンドポイントが無いための暫定実装で、
 * 将来は自前/有料ジオコーディングへ差し替える想定。
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/** 現在地から導いた検索用エリア情報。 */
export type CurrentLocation = {
  /** 検索に使うエリア名（例: 「小諸市」）。逆ジオコーディング失敗時は座標文字列。 */
  label: string;
  coords: Coordinates;
};

/** Geolocation の取得失敗を、UI で出し分けしやすい理由付きで表すエラー。 */
export class GeolocationError extends Error {
  readonly reason: "unsupported" | "denied" | "unavailable" | "timeout" | "unknown";

  constructor(reason: GeolocationError["reason"], message: string) {
    super(message);
    this.name = "GeolocationError";
    this.reason = reason;
  }
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 0,
};

function mapGeolocationError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError(
        "denied",
        "位置情報の利用が許可されていません。ブラウザの設定でこのサイトの位置情報を「許可」にしてください。",
      );
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError("unavailable", "現在地を取得できませんでした。");
    case error.TIMEOUT:
      return new GeolocationError("timeout", "現在地の取得がタイムアウトしました。");
    default:
      return new GeolocationError("unknown", "現在地の取得に失敗しました。");
  }
}

function toCoordinates(position: GeolocationPosition): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/** 位置情報の許可状態（Permissions API 非対応時は unknown）。 */
export async function queryGeolocationPermission(): Promise<PermissionState | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    return "unknown";
  }
}

/**
 * 現在地の座標を取得する。
 *
 * iOS Safari は許可ダイアログを出すために「ユーザー操作（タップ）のハンドラ内で、
 * setState や await より先に同期的に geolocation API を呼ぶ」ことを要求する。
 * そのため呼び出し側（InputScreen）では、この関数を他の処理より先に呼ぶこと。
 */
export function requestCurrentCoordinates(
  onSuccess: (coords: Coordinates) => void,
  onError: (error: GeolocationError) => void,
): void {
  if (!window.isSecureContext) {
    onError(
      new GeolocationError(
        "unsupported",
        "位置情報はHTTPS接続（またはlocalhost）でのみ利用できます。",
      ),
    );
    return;
  }

  if (!("geolocation" in navigator)) {
    onError(new GeolocationError("unsupported", "この端末では現在地を取得できません。"));
    return;
  }

  // success / error のどちらか一方だけを確実に1回呼ぶためのガード。
  let settled = false;
  let watchdog = 0;
  const finish = (run: () => void) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(watchdog);
    run();
  };

  // 一部のモバイル端末では、OS 側の「位置情報サービス」が無効だと success/error の
  // どちらのコールバックも呼ばれず無反応のまま固まることがある。その場合でも
  // 画面が固まらないよう、案内付きのタイムアウトで打ち切る。
  watchdog = window.setTimeout(
    () => {
      finish(() =>
        onError(
          new GeolocationError(
            "timeout",
            "現在地を取得できませんでした。端末の「位置情報サービス」と、ブラウザのサイト設定で位置情報を「許可」にしてからお試しください。",
          ),
        ),
      );
    },
    (GEO_OPTIONS.timeout ?? 15_000) + 3_000,
  );

  navigator.geolocation.getCurrentPosition(
    (position) => finish(() => onSuccess(toCoordinates(position))),
    (error) => finish(() => onError(mapGeolocationError(error))),
    GEO_OPTIONS,
  );
}

/** Nominatim の逆ジオコーディング結果から日本語のエリア名を組み立てる。 */
type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  suburb?: string;
  ward?: string;
  state?: string;
  province?: string;
};

function pickAreaName(address: NominatimAddress): string | null {
  const area =
    address.city ?? address.town ?? address.village ?? address.county ?? address.suburb ?? address.ward ?? null;
  if (area) return area;
  // 市区町村が取れない場合は都道府県でフォールバック。
  return address.state ?? address.province ?? null;
}

async function reverseGeocode(coords: Coordinates): Promise<string | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(coords.latitude),
    lon: String(coords.longitude),
    "accept-language": "ja",
    zoom: "12",
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: NominatimAddress };
    return body.address ? pickAreaName(body.address) : null;
  } catch {
    return null;
  }
}

export async function coordsToLocation(coords: Coordinates): Promise<CurrentLocation> {
  const area = await reverseGeocode(coords);
  const label =
    area ?? `現在地（${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}）`;
  return { label, coords };
}

/**
 * 現在地を取得し、可能ならエリア名へ変換して返す。
 * 位置情報の取得自体に失敗した場合は {@link GeolocationError} を投げる。
 *
 * モバイルでは {@link requestCurrentCoordinates} をユーザータップの同期ハンドラ内で呼ぶこと。
 */
export async function detectCurrentLocation(): Promise<CurrentLocation> {
  const coords = await new Promise<Coordinates>((resolve, reject) => {
    requestCurrentCoordinates(resolve, reject);
  });
  return coordsToLocation(coords);
}

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

/** ブラウザの位置情報 API を Promise 化して現在の座標を取得する。 */
function getCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new GeolocationError("unsupported", "この端末では現在地を取得できません。"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new GeolocationError(
                "denied",
                "位置情報の利用が許可されていません。ブラウザの設定をご確認ください。",
              ),
            );
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new GeolocationError("unavailable", "現在地を取得できませんでした。"));
            break;
          case error.TIMEOUT:
            reject(new GeolocationError("timeout", "現在地の取得がタイムアウトしました。"));
            break;
          default:
            reject(new GeolocationError("unknown", "現在地の取得に失敗しました。"));
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
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

/**
 * 現在地を取得し、可能ならエリア名へ変換して返す。
 * 位置情報の取得自体に失敗した場合は {@link GeolocationError} を投げる。
 */
export async function detectCurrentLocation(): Promise<CurrentLocation> {
  const coords = await getCurrentCoordinates();
  const area = await reverseGeocode(coords);
  const label =
    area ?? `現在地（${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}）`;
  return { label, coords };
}

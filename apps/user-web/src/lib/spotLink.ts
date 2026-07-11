const SPOT_PARAM = "spot";

/** 共有・ディープリンク用 URL（例: https://example.com/?spot=s1） */
export function buildSpotShareUrl(spotId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(SPOT_PARAM, spotId);
  return url.toString();
}

/** 現在の URL からスポット ID を読み取る。 */
export function readSpotIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URL(window.location.href).searchParams.get(SPOT_PARAM);
  return id?.trim() || null;
}

/** ブラウザ URL のスポットクエリを更新する（履歴エントリは増やさない）。 */
export function setSpotIdInLocation(spotId: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (spotId) {
    url.searchParams.set(SPOT_PARAM, spotId);
  } else {
    url.searchParams.delete(SPOT_PARAM);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

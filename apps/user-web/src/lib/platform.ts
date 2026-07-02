/** iOS（iPadOS 含む）かどうか。 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Android 端末かどうか。 */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** スマートフォン / タブレット向け UA かどうか。 */
export function isMobileDevice(): boolean {
  return isIOS() || isAndroid();
}

/** iOS の Safari 本体（Chrome/Firefox 等のアプリ内ブラウザは false）。 */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

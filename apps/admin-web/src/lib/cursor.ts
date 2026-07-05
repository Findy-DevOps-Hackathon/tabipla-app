const POINTER_SELECTOR =
  'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"]), [role="tab"]:not([aria-disabled="true"]), select:not(:disabled), input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled), input[type="file"]:not(:disabled), label:has(input[type="file"]:not(:disabled))';

const DISABLED_SELECTOR = "button:disabled, select:disabled, input:disabled";

/** Safari 等で SVG 上のカーソルが背景に抜ける問題へのフォールバック */
export function installPointerCursorFallback() {
  document.addEventListener(
    "mouseover",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest(DISABLED_SELECTOR)) {
        document.body.style.cursor = "not-allowed";
        return;
      }

      if (target.closest(POINTER_SELECTOR)) {
        document.body.style.cursor = "pointer";
        return;
      }

      document.body.style.removeProperty("cursor");
    },
    { passive: true },
  );
}

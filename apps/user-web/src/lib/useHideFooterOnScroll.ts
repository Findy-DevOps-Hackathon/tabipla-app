import { useEffect, useRef, useState } from "react";

/** スクロール方向の判定に使う最小移動量（px）。 */
const SCROLL_DELTA = 8;

/**
 * ウィンドウ（ドキュメント）のスクロールを監視し、上方向（コンテンツを下へ進む）
 * スクロールでフッターを隠し、下方向スクロールまたは先頭付近で再表示する。
 *
 * スクロールはドキュメント側で行う構成（PhoneShell 参照）なので、ここでも
 * window の scrollY を見る。これに合わせて iOS Safari のツールバーも縮小する。
 */
export function useHideFooterOnScroll(resetKey: string): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollTop = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey 変化時に再初期化させるためのトリガー。
  useEffect(() => {
    setVisible(true);
    lastScrollTop.current = window.scrollY;

    function handleScroll() {
      const scrollTop = window.scrollY;
      const delta = scrollTop - lastScrollTop.current;
      lastScrollTop.current = scrollTop;

      if (scrollTop <= 4) {
        setVisible(true);
        return;
      }
      if (delta > SCROLL_DELTA) {
        setVisible(false);
      } else if (delta < -SCROLL_DELTA) {
        setVisible(true);
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [resetKey]);

  return visible;
}

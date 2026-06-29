import { useEffect, useState } from "react";

export type VisualViewportState = {
  /** 実際に見えている領域の高さ（ソフトキーボード表示時はその分だけ縮む）。 */
  height: number;
  /** レイアウトビューポート上端からの、見えている領域のオフセット。 */
  offsetTop: number;
};

/**
 * `window.visualViewport` を購読し、見えている領域の高さ・オフセットを返す。
 *
 * iOS Safari ではソフトキーボードがレイアウトビューポートを縮めず上に覆い被さるため、
 * `fixed inset-0`（= レイアウトビューポート全体）のオーバーレイは入力欄がキーボードの
 * 裏に隠れてしまう。body を `position:fixed` でロックしているとページもスクロールできず、
 * キーボードを閉じた後もずれが残ってタップ・スクロールが効かなくなる。
 * このフックで得た値でオーバーレイの高さ・位置をキーボードへ追従させることで回避する。
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => ({
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setState({ height: vv.height, offsetTop: vv.offsetTop });
    };
    update();

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}

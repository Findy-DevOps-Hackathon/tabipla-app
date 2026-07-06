import type { ReactNode, RefObject } from "react";

/**
 * モバイル幅（最大 500px）の表示シェル。
 * デスクトップでは中央寄せのカード風に、モバイルでは画面いっぱいに広げる。
 *
 * スクロールは「ドキュメント（ウィンドウ）」側で行う。これにより iOS Safari の
 * 下部ツールバーがスクロールに連動して自動で縮小する。横方向だけは overflow-x-clip
 * で抑え、縦方向は visible のままにしてウィンドウスクロールを成立させている
 * （hidden は使わない。hidden は反対軸を auto 化しスクロールコンテナになってしまうため）。
 */
export function PhoneShell({
  children,
  shellRef,
}: {
  children: ReactNode;
  shellRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex min-h-svh justify-center bg-[#e2e8f0]">
      <div
        ref={shellRef}
        className="relative flex min-h-svh w-full max-w-[500px] flex-col overflow-x-clip bg-(--page) sm:shadow-[0_0_60px_rgba(15,23,42,0.18)] sm:ring-1 sm:ring-black/5"
      >
        {children}
      </div>
    </div>
  );
}

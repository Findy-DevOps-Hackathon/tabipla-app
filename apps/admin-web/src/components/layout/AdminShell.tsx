import type { ReactNode } from "react";
import {
  ADMIN_CONTENT_MAX_WIDTH_CLASS,
  ADMIN_TABLE_MAX_WIDTH_CLASS,
} from "../../lib/layout.ts";
import { Sidebar } from "./Sidebar.tsx";

type Props = {
  title: string;
  syncBadge?: boolean;
  /** 表形式レイアウト向けにコンテンツ幅を広げる */
  wide?: boolean;
  children: ReactNode;
};

export function AdminShell({ title, syncBadge, wide, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f1f6fb]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center border-b border-[#e2e8f0] bg-white px-8">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-[#0f172a] tracking-wider">{title}</h1>
            {syncBadge && (
              <span className="rounded border border-[#10b981]/20 bg-[#f0fdf4] px-2 py-0.5 text-xs font-medium text-[#10b981]">
                検索インデックス: 同期済み
              </span>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-[#f1f6fb] [scrollbar-gutter:stable]">
          <div
            className={`mx-auto w-full ${wide ? ADMIN_TABLE_MAX_WIDTH_CLASS : ADMIN_CONTENT_MAX_WIDTH_CLASS}`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

import { ClockIcon, HomeIcon, SearchIcon } from "./icons.tsx";

/** 下部ナビのタブ種別。 */
export type NavTab = "home" | "search" | "history";

type BottomNavProps = {
  /** 現在アクティブなタブ。 */
  active: NavTab;
  /** タブ選択時。 */
  onNavigate: (tab: NavTab) => void;
  /** 上方向スクロール時に false になり、フッターがスライドアウトする。 */
  visible?: boolean;
};

const TABS = [
  { id: "home", label: "ホーム", Icon: HomeIcon },
  { id: "search", label: "探す", Icon: SearchIcon },
  { id: "history", label: "履歴", Icon: ClockIcon },
] as const;

/**
 * 画面下部に固定表示するタブバー風フッター。
 * ホーム / 探す / 履歴 の主要セクションを切り替える。
 * iOS のホームインジケータ領域（safe-area-inset-bottom）を考慮して余白を確保する。
 */
export function BottomNav({ active, onNavigate, visible = true }: BottomNavProps) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center transition-transform duration-300 ease-out ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <nav className="pointer-events-auto flex w-full max-w-[500px] shrink-0 border-t border-[#e2e8f0] bg-white/80 px-2 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition active:scale-95 ${
                isActive ? "text-[#0f172a]" : "text-[#52647d]"
              }`}
            >
              <Icon className="size-6" strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

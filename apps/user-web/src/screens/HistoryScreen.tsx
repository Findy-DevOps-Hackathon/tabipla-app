import { useState } from "react";
import {
  ChevronLeftIcon,
  ClockIcon,
  LogoutIcon,
  MapPinIcon,
  TrashIcon,
} from "../components/icons.tsx";
import { RECOMMENDATIONS, type Recommendation } from "../data/spots.ts";
import { categoryBadgeClass } from "../lib/category.ts";
import { DANGER_BUTTON, PRIMARY_BUTTON } from "../lib/ui.ts";
import { listVisited, toggleVisited, type VisitedSpot } from "../lib/visited.ts";

type HistoryScreenProps = {
  /** 履歴を表示する対象ユーザーの ID。 */
  userId: string;
  /** ログイン済みか。未ログイン時は履歴の代わりに会員登録を促す。 */
  isLoggedIn: boolean;
  /** 未ログインで「会員登録して始める」タップ時。 */
  onRequireAuth: () => void;
  /** 履歴のスポットをタップしたとき。スポット詳細を開く。 */
  onOpenSpot: (recommendation: Recommendation) => void;
  /** 「← 戻る」タップ時。 */
  onBack: () => void;
  /** 「ログアウト」タップ時。 */
  onLogout: () => void;
};

/** 行った日時を「2026/6/22」形式で表示する。 */
function formatVisitedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** 市ごとにまとめた履歴グループ。 */
type CityGroup = {
  /** グループの一意キー（都道府県 + 市）。 */
  key: string;
  /** 都道府県名。 */
  prefecture: string;
  /** 市（エリア）名。 */
  area: string;
  /** その市に属する訪問履歴。 */
  spots: VisitedSpot[];
};

/** 訪問履歴を市（エリア）ごとにグループ化する。各グループは最新の訪問順に並ぶ。 */
function groupByCity(items: VisitedSpot[]): CityGroup[] {
  const groups = new Map<string, CityGroup>();
  for (const spot of items) {
    const key = `${spot.prefecture} / ${spot.area}`;
    const group = groups.get(key);
    if (group) {
      group.spots.push(spot);
    } else {
      groups.set(key, {
        key,
        prefecture: spot.prefecture,
        area: spot.area,
        spots: [spot],
      });
    }
  }
  return [...groups.values()];
}

/** 「行った」と記録したスポットの履歴一覧。 */
export function HistoryScreen({
  userId,
  isLoggedIn,
  onRequireAuth,
  onOpenSpot,
  onBack,
  onLogout,
}: HistoryScreenProps) {
  const [items, setItems] = useState<VisitedSpot[]>(() => listVisited(userId));
  // 削除確認モーダルの対象スポット。null のときはモーダル非表示。
  const [pendingRemoval, setPendingRemoval] = useState<VisitedSpot | null>(null);
  // スポット詳細が見つからなかったときのモーダル表示。null のときは非表示。
  const [notFoundName, setNotFoundName] = useState<string | null>(null);

  const handleConfirmRemove = () => {
    if (!pendingRemoval) return;
    toggleVisited(userId, pendingRemoval);
    setItems(listVisited(userId));
    setPendingRemoval(null);
  };

  // 履歴のスポットをタップ → 詳細データを引き当てて詳細画面を開く。
  // データが見つからない（提供終了・ID 変更など）場合は「見つかりませんでした」を表示する。
  const handleOpenSpot = (spot: VisitedSpot) => {
    const rec = RECOMMENDATIONS.find((r) => r.id === spot.id);
    if (rec) {
      onOpenSpot(rec);
    } else {
      setNotFoundName(spot.name);
    }
  };

  const cityGroups = groupByCity(items);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col border-b border-[#e2e8f0] bg-white">
        <div className="flex items-center gap-2 px-4 pb-3 pt-6">
          <button
            type="button"
            onClick={onBack}
            aria-label="戻る"
            className="flex size-9 items-center justify-center rounded-full text-[#0f172a] transition active:bg-[#f1f5f9]"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <div className="flex flex-col gap-0.5">
            <p className="text-[17px] font-extrabold text-[#0f172a]">行った履歴</p>
            <p className="text-[13px] text-[#64748b]">
              {isLoggedIn ? `${items.length} 件のスポット` : "会員登録で利用できます"}
            </p>
          </div>
          {isLoggedIn && (
            <button
              type="button"
              onClick={onLogout}
              className="ml-auto flex flex-col items-center gap-1 rounded-full  px-3 py-3 text-[12px] font-semibold text-[#64748b] transition active:scale-[0.98] active:bg-[#f1f5f9]"
            >
              <LogoutIcon className="size-5" />
            </button>
          )}
        </div>
      </div>

      {!isLoggedIn ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <ClockIcon className="size-12 text-[#cbd5e1]" strokeWidth={1.5} />
          <div className="flex flex-col gap-1.5">
            <p className="text-[15px] font-bold text-[#0f172a]">行った履歴は会員機能です</p>
            <p className="text-[13px] leading-[1.6] text-[#64748b]">
              訪れたスポットを記録することができます
            </p>
          </div>
          <button
            type="button"
            onClick={onRequireAuth}
            className={`${PRIMARY_BUTTON} h-12 max-w-[280px] text-[15px]`}
          >
            会員登録して始める
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <ClockIcon className="size-12 text-[#cbd5e1]" strokeWidth={1.5} />
          <p className="text-[15px] font-bold text-[#0f172a]">まだ履歴がありません</p>
          <p className="text-[13px] leading-[1.6] text-[#64748b]">
            おすすめスポットで「行った」ボタンを押すと、
            <br />
            ここに訪れた場所が記録されます。
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-6 p-4">
          {cityGroups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-(--brand)" />
                <h2 className="text-[14px] font-extrabold text-[#0f172a]">{group.area}</h2>
                <span className="text-[12px] text-[#94a3b8]">{group.prefecture}</span>
                <span className="ml-auto text-[12px] font-bold text-[#94a3b8]">
                  {group.spots.length} 件
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {group.spots.map((spot) => (
                  <article
                    key={spot.id}
                    className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenSpot(spot)}
                      aria-label={`${spot.name} の詳細を見る`}
                      className="flex min-w-0 flex-1 flex-col gap-1.5 text-left transition active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-[3px] text-[12px] font-bold ${categoryBadgeClass(
                            spot.category,
                          )}`}
                        >
                          {spot.category}
                        </span>
                        <span className="text-[11px] text-[#94a3b8]">
                          {formatVisitedAt(spot.visitedAt)}
                        </span>
                      </div>
                      <p className="truncate text-[16px] font-bold text-[#0f172a]">{spot.name}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(spot)}
                      aria-label={`${spot.name} を履歴から削除`}
                      className="flex size-9 items-center justify-center rounded-full text-[#94a3b8] transition active:bg-[#f1f5f9]"
                    >
                      <TrashIcon className="size-5" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {pendingRemoval && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
          <div className="flex w-full max-w-[330px] flex-col gap-5 rounded-3xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.3)]">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-[#fff1f2]">
                <TrashIcon className="size-6 text-[#f43f5e]" />
              </div>
              <p className="text-[16px] font-extrabold text-[#0f172a]">履歴から削除しますか？</p>
              <p className="text-[13px] leading-[1.6] text-[#64748b]">
                <span className="font-bold text-[#0f172a]">{pendingRemoval.name}</span>
                <br />
                を行った履歴から削除します。
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirmRemove}
                className={`${DANGER_BUTTON} h-12 text-[15px]`}
              >
                削除する
              </button>
              <button
                type="button"
                onClick={() => setPendingRemoval(null)}
                className="flex h-12 w-full items-center justify-center rounded-full text-[14px] font-semibold text-[#64748b] transition active:bg-[#f1f5f9]"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {notFoundName && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
          <div className="flex w-full max-w-[330px] flex-col gap-5 rounded-3xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.3)]">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-[#f1f5f9]">
                <MapPinIcon className="size-6 text-[#94a3b8]" />
              </div>
              <p className="text-[16px] font-extrabold text-[#0f172a]">見つかりませんでした</p>
              <p className="text-[13px] leading-[1.6] text-[#64748b]">
                <span className="font-bold text-[#0f172a]">{notFoundName}</span>
                <br />
                の詳細情報が見つかりませんでした。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotFoundName(null)}
              className={`${PRIMARY_BUTTON} h-12 text-[15px]`}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { Fragment, useEffect, useRef, useState } from "react";
import { CardsIcon, SparklesIcon } from "../components/icons.tsx";
import { RECOMMENDATIONS_PAGE_SIZE, type Recommendation } from "../data/spots.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { isVisited } from "../lib/visited.ts";

type RecommendationsScreenProps = {
  recommendations: Recommendation[];
  /** 好み診断を完了済みか。未完了ならおすすめ一覧の代わりに診断開始を促す。 */
  diagnosisComplete: boolean;
  /** 「好みをより詳しく設定する」を済ませたか。済みなら同ボタンを一覧に挟まない。 */
  detailedComplete: boolean;
  /** 訪問履歴を保存する対象ユーザーの ID。 */
  userId: string;
  /** 「好み診断を開始する」タップ時。 */
  onStartDiagnosis: () => void;
  /** 「好みを再学習する」タップ時。 */
  onRestart: () => void;
  /**
   * カードタップ時にスポット詳細を開く。
   * 詳細モーダルはブラウザ履歴と連動させるため App 側で一元管理する
   *（ここで独自に開くと「戻る」で閉じられない）。
   */
  onOpenSpot: (recommendation: Recommendation) => void;
};

/** フロー 5: 厳選したおすすめスポット一覧（ai-recommendations）。 */
export function RecommendationsScreen({
  recommendations,
  diagnosisComplete,
  detailedComplete,
  userId,
  onStartDiagnosis,
  onRestart,
  onOpenSpot,
}: RecommendationsScreenProps) {
  // 一覧から除外する判定は「この画面を開いた時点」のスナップショットで固定する。
  // こうすることで、表示中に「行った」を押してもカードは消えず、
  // 次にこの画面を読み込み直したときに初めて一覧から外れる。
  const [initiallyVisitedIds] = useState<Set<string>>(
    () => new Set(recommendations.filter((rec) => isVisited(userId, rec.id)).map((rec) => rec.id)),
  );
  // 初回から先頭ページを表示する（以降はスクロールで追加読み込み）。
  const [visibleCount, setVisibleCount] = useState(RECOMMENDATIONS_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 読み込み時点で訪問済みだったスポットのみ提案から除外する（履歴で振り返る想定）。
  const visibleRecommendations = recommendations.filter((rec) => !initiallyVisitedIds.has(rec.id));
  const displayedRecommendations = visibleRecommendations.slice(0, visibleCount);
  const hasMore = visibleCount < visibleRecommendations.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

    // スクロールはウィンドウ（ドキュメント）側で行うため、監視ルートはビューポート（null）。
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) =>
            Math.min(count + RECOMMENDATIONS_PAGE_SIZE, visibleRecommendations.length),
          );
        }
      },
      { root: null, rootMargin: "80px", threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, visibleRecommendations.length]);

  return (
    <div className="flex flex-1 flex-col bg-(--page)">
      <div className="flex flex-1 flex-col gap-3 p-4 pb-20">
        <div className="flex flex-col gap-0.5">
          <p className="w-fit bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-extrabold text-transparent">
            tabipla
          </p>
          <p className="text-[17px] font-extrabold text-[#0f172a]">あなたへのおすすめスポット</p>
        </div>

        {!diagnosisComplete && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
            <div className="flex flex-col gap-1.5">
              <p className="text-[16px] font-bold text-[#0f172a]">好み診断がまだ完了していません</p>
              <p className="text-[13px] leading-[1.6] text-[#64748b]">
                好みを教えていただくと、
                <br />
                あなたに合ったおすすめを表示できます。
              </p>
            </div>
            <button
              type="button"
              onClick={onStartDiagnosis}
              className={`${PRIMARY_BUTTON} max-w-[320px] px-5 py-[15px] text-[16px] tracking-[1.6px]`}
            >
              好み診断を開始する
            </button>
          </div>
        )}

        {diagnosisComplete && visibleRecommendations.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-[15px] font-bold text-[#0f172a]">
              行ってみたいスポットがなくなりました
            </p>
            <p className="text-[13px] text-[#64748b]">
              おすすめはすべて訪問済みです。好みを設定し直すと新しい提案が見つかります。
            </p>
          </div>
        )}
        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <p className="text-[12px] font-semibold text-[#64748b]">おすすめ順</p>
        )}

        {diagnosisComplete &&
          displayedRecommendations.map((rec, index) => (
            <Fragment key={rec.id}>
              <article className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                <button
                  type="button"
                  onClick={() => onOpenSpot(rec)}
                  aria-label={`${rec.name} の詳細を見る`}
                  className="flex flex-col text-left transition active:opacity-90"
                >
                  <div className="relative aspect-16/10 w-full">
                    <img
                      src={rec.image}
                      alt={rec.name}
                      className="absolute inset-0 size-full object-cover"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />

                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
                      <p className="text-[11px] font-medium text-white/80">
                        {rec.prefecture} / {rec.area}
                      </p>
                      <p className="text-[20px] font-extrabold leading-tight text-white drop-shadow-sm">
                        {rec.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-1.5 rounded-md bg-(--ai-bg) px-2.5 py-1.5">
                      <SparklesIcon className="size-3.5 shrink-0 text-(--ai-fg)" />
                      <p className="text-[12px] font-semibold text-(--ai-fg)">{rec.reason}</p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {rec.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-[#e2e8f0] px-2 py-1 text-[12px] text-[#475569]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              </article>
              {!detailedComplete && (index + 1) % 10 === 0 && (
                <button
                  type="button"
                  onClick={onRestart}
                  className={`${PRIMARY_BUTTON} relative h-8 shrink-0 overflow-hidden py-8 text-[15px] tracking-[1.6px]`}
                >
                  <CardsIcon className="pointer-events-none absolute left-4 top-3/5 size-24 -translate-y-1/2 text-white/30 opacity-50" />
                  <span className="relative text-shadow-md">好みをより詳しく分析する</span>
                </button>
              )}
            </Fragment>
          ))}
        {diagnosisComplete && hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-2">
            <div className="size-6 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a]" />
          </div>
        )}
      </div>
    </div>
  );
}

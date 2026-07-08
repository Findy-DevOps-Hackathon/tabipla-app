import { Fragment, useEffect, useRef, useState } from "react";
import { AiGuideAvatar } from "../components/AiGuideAvatar.tsx";
import { AiGuideSpeechBubble } from "../components/AiGuideSpeechBubble.tsx";
import { CardsIcon, ChevronRightIcon, MapPinIcon } from "../components/icons.tsx";
import { SpotImage } from "../components/SpotImage.tsx";
import { RECOMMENDATIONS_PAGE_SIZE, type Recommendation } from "../data/spots.ts";
import { categoryOverlayBadgeClass } from "../lib/category.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { isVisited } from "../lib/visited.ts";

type RecommendationsScreenProps = {
  recommendations: Recommendation[];
  /** API から取得した探索用スポット（診断前）。 */
  exploreSpots?: Recommendation[];
  /** 探索スポット見出し用のエリア名。 */
  destinationArea?: string;
  /** 好み診断を完了済みか。 */
  diagnosisComplete: boolean;
  /** 「好み診断を開始する」タップ時。 */
  onStartDiagnosis: () => void;
  /** 「好みを再学習する」タップ時。 */
  onRestart: () => void;
  /** 「ホームに戻る」タップ時。 */
  onGoHome: () => void;
  /** スポット詳細を開く。 */
  onOpenSpot: (recommendation: Recommendation) => void;
  /** AI が生成したおすすめ紹介文（API の result） */
  aiIntroMessage?: string;
  /** 診断後: API に未読込のおすすめが残っているか。 */
  hasMoreRecommendations?: boolean;
  /** 診断後: 次ページ読み込み中。 */
  loadingMoreRecommendations?: boolean;
  /** 診断後: 次ページを API から取得。 */
  onLoadMoreRecommendations?: () => void;
};

/** フロー 5: 厳選したおすすめスポット一覧（ai-recommendations）。 */
export function RecommendationsScreen({
  recommendations,
  exploreSpots = [],
  destinationArea = "小諸市",
  diagnosisComplete,
  onStartDiagnosis,
  onRestart,
  onGoHome,
  onOpenSpot,
  aiIntroMessage = "",
  hasMoreRecommendations = false,
  loadingMoreRecommendations = false,
  onLoadMoreRecommendations,
}: RecommendationsScreenProps) {
  const listSource = diagnosisComplete ? recommendations : exploreSpots;
  const [initiallyVisitedIds] = useState<Set<string>>(
    () =>
      new Set(
        diagnosisComplete
          ? recommendations.filter((rec) => isVisited(rec.id)).map((rec) => rec.id)
          : [],
      ),
  );
  const [visibleCount, setVisibleCount] = useState(RECOMMENDATIONS_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const visibleRecommendations = listSource.filter((rec) => !initiallyVisitedIds.has(rec.id));
  const displayedRecommendations = diagnosisComplete
    ? visibleRecommendations
    : visibleRecommendations.slice(0, visibleCount);
  const hasMore = diagnosisComplete
    ? hasMoreRecommendations
    : visibleCount < visibleRecommendations.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (diagnosisComplete) {
          onLoadMoreRecommendations?.();
          return;
        }
        setVisibleCount((count) =>
          Math.min(count + RECOMMENDATIONS_PAGE_SIZE, visibleRecommendations.length),
        );
      },
      { root: null, rootMargin: "80px", threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, diagnosisComplete, onLoadMoreRecommendations, visibleRecommendations.length]);

  return (
    <div className="flex flex-1 flex-col bg-(--page)">
      <div className="flex flex-1 flex-col gap-4 p-4 pb-20">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={onGoHome}
            aria-label="ホームに戻る"
            className="w-fit bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-extrabold text-transparent transition active:scale-95"
          >
            tabipla
          </button>
        </div>

        {/* ① AI によるおすすめ紹介文 */}
        {diagnosisComplete && visibleRecommendations.length > 0 && aiIntroMessage && (
          <div className="flex items-end gap-1">
            <AiGuideAvatar size={40} className="shrink-0" />
            <AiGuideSpeechBubble>
              <span className="text-[13px]">{aiIntroMessage}</span>
            </AiGuideSpeechBubble>
          </div>
        )}

        {!diagnosisComplete && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3">
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-bold text-[#0f172a]">好み診断でさらに絞り込む</p>
              <p className="text-[12px] leading-[1.6] text-[#64748b]">
                好み診断で比較して選んでいただくと、あなたに合ったおすすめを表示できます。
              </p>
            </div>
            <button
              type="button"
              onClick={onStartDiagnosis}
              className={`${PRIMARY_BUTTON} px-4 py-3 text-[14px] tracking-[1.2px]`}
            >
              好み診断を開始する
            </button>
          </div>
        )}

        {!diagnosisComplete && visibleRecommendations.length > 0 && (
          <p className="text-[12px] font-semibold text-[#64748b]">{destinationArea}のスポット</p>
        )}

        {!diagnosisComplete && visibleRecommendations.length > 0 && (
          <div className="grid grid-cols-2 gap-3 w-full">
            {displayedRecommendations.map((rec, index) => {
              return (
                <Fragment key={rec.id}>
                  <article className="relative aspect-square shrink-0 overflow-hidden rounded-xl border border-[#e2e8f0] bg-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition active:scale-[0.99] w-full">
                    <button
                      type="button"
                      onClick={() => onOpenSpot(rec)}
                      aria-label={`${rec.name} の詳細を見る`}
                      className="absolute inset-0 w-full text-left transition"
                    >
                      <SpotImage
                        src={rec.image}
                        alt={rec.name}
                        className="absolute inset-0 size-full object-cover"
                        priority={index < 4}
                        lazy={index >= 4}
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
                      <span
                        className={`absolute top-1.5 left-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white ${categoryOverlayBadgeClass(rec.category)}`}
                      >
                        {rec.category}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 p-2 gap-0.5 flex flex-col">
                        <p className="flex items-center gap-0.5 text-[10px] font-medium text-white/90 text-shadow-md">
                          <MapPinIcon className="size-2.5 shrink-0 drop-shadow-sm" />
                          {rec.prefecture} / {rec.area}
                        </p>
                        <p className="text-[14px] font-extrabold leading-tight text-white text-shadow-lg line-clamp-2">
                          {rec.name}
                        </p>
                      </div>
                    </button>
                  </article>

                  {(index + 1) % 10 === 0 && (
                    <div className="col-span-2 py-2">
                      <button
                        type="button"
                        onClick={onStartDiagnosis}
                        className={`${PRIMARY_BUTTON} relative h-8 shrink-0 overflow-hidden py-8 text-[15px] tracking-[1.6px]`}
                      >
                        <CardsIcon className="pointer-events-none absolute left-4 top-3/5 size-24 -translate-y-1/2 text-white/30 opacity-50" />
                        <span className="relative text-shadow-md">好みを設定する</span>
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}

        {!diagnosisComplete && hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-2">
            <div className="size-6 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a]" />
          </div>
        )}

        {diagnosisComplete && visibleRecommendations.length === 0 && (
          <div className="flex flex-1 flex-col justify-center gap-8 py-16">
            <div className="flex items-end gap-1">
              <AiGuideAvatar size={44} className="shrink-0" />
              <AiGuideSpeechBubble>
                <span className="text-[13px] font-bold text-[#0f172a]">
                  おすすめのスポットが見つかりませんでした
                </span>
                <span className="text-[13px]">
                  {aiIntroMessage ||
                    `${destinationArea}の観光スポットが登録されていないか、選択した条件に合うスポットがありません。`}
                </span>
              </AiGuideSpeechBubble>
            </div>
            <button
              type="button"
              onClick={onGoHome}
              className={`${PRIMARY_BUTTON} h-16 tracking-wider px-6 py-3 text-[14px]`}
            >
              ホームに戻る
              <ChevronRightIcon className="size-5" />
            </button>
          </div>
        )}

        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <p className="text-[12px] font-semibold text-[#64748b]">おすすめ順</p>
        )}

        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <div className="grid grid-cols-2 gap-3 w-full">
            {displayedRecommendations.map((rec, index) => {
              return (
                <Fragment key={rec.id}>
                  <article className="relative aspect-square shrink-0 overflow-hidden rounded-xl border border-[#e2e8f0] bg-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition active:scale-[0.99] w-full">
                    <button
                      type="button"
                      onClick={() => onOpenSpot(rec)}
                      aria-label={`${rec.name} の詳細を見る`}
                      className="absolute inset-0 w-full text-left transition"
                    >
                      <SpotImage
                        src={rec.image}
                        alt={rec.name}
                        className="absolute inset-0 size-full object-cover"
                        priority={index < 4}
                        lazy={index >= 4}
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
                      <span
                        className={`absolute top-1.5 left-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white ${categoryOverlayBadgeClass(rec.category)}`}
                      >
                        {rec.category}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 p-2 gap-0.5 flex flex-col">
                        <p className="flex items-center gap-0.5 text-[10px] font-medium text-white/90 text-shadow-md">
                          <MapPinIcon className="size-2.5 shrink-0 drop-shadow-sm" />
                          {rec.prefecture} / {rec.area}
                        </p>
                        <p className="text-[14px] font-extrabold leading-tight text-white text-shadow-lg line-clamp-2">
                          {rec.name}
                        </p>
                      </div>
                    </button>
                  </article>

                  {(index + 1) % 10 === 0 && visibleRecommendations.length > 10 && (
                    <div className="col-span-2 py-2">
                      <button
                        type="button"
                        onClick={onRestart}
                        className={`${PRIMARY_BUTTON} relative h-8 shrink-0 overflow-hidden py-8 text-[15px] tracking-[1.6px]`}
                      >
                        <CardsIcon className="pointer-events-none absolute left-4 top-3/5 size-24 -translate-y-1/2 text-white/30 opacity-50" />
                        <span className="relative text-shadow-md">好み診断を追加で行う</span>
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}

        {diagnosisComplete && hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-2">
            <div
              className={`size-6 rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a] ${loadingMoreRecommendations ? "animate-spin" : ""}`}
            />
          </div>
        )}

        {visibleRecommendations.length > 0 && !hasMore && (
          <div className="mt-2 flex flex-col gap-3">
            {diagnosisComplete && visibleRecommendations.length <= 10 && (
              <button
                type="button"
                onClick={onRestart}
                className={`${PRIMARY_BUTTON} relative h-14 w-full overflow-hidden text-[15px] tracking-[1.2px]`}
              >
                <CardsIcon className="pointer-events-none absolute left-4 top-1/2 size-20 -translate-y-1/2 text-white/30 opacity-50" />
                <span className="relative text-shadow-md">好みをより深く設定する</span>
              </button>
            )}
            <button
              type="button"
              onClick={onGoHome}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white py-3 text-[14px] font-semibold text-[#475569] transition active:scale-[0.98] active:bg-[#f1f5f9]"
            >
              ホームに戻る
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

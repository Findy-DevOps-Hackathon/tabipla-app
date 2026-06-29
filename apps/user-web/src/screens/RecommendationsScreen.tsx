import { Fragment, useEffect, useRef, useState } from "react";
import { CardsIcon, ChevronRightIcon, MapPinIcon } from "../components/icons.tsx";
import { EXPLORE_SPOTS, RECOMMENDATIONS_PAGE_SIZE, type Recommendation } from "../data/spots.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { isVisited } from "../lib/visited.ts";

type RecommendationsScreenProps = {
  recommendations: Recommendation[];
  /** 好み診断を完了済みか。 */
  diagnosisComplete: boolean;
  /** ユーザーの ID。 */
  userId: string;
  /** 「好み診断を開始する」タップ時。 */
  onStartDiagnosis: () => void;
  /** 「好みを再学習する」タップ時。 */
  onRestart: () => void;
  /** 「ホームに戻る」タップ時。 */
  onGoHome: () => void;
  /** スポット詳細を開く。 */
  onOpenSpot: (recommendation: Recommendation) => void;
  /** AI がまとめた好みの概要 */
  profileSummary?: string;
};

/**
 * AI が生成した好み概要文字列を、自然な1文の説明に組み立てる。
 * 例: "カテゴリ: 歴史・自然 / 好みの要素: 絶景・ワイン / 価格感: ¥¥前後まで" →
 *     "歴史・自然 が好みの傾向で、絶景・ワイン といった要素に惹かれるようです。予算は ¥¥前後まで が目安です。"
 * 構造化できない場合は元の文字列をそのまま返す。
 */
function buildPreferenceSentence(summary: string): string {
  const sections = summary
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, ...rest] = part.split(/[:：]/);
      const value = rest.join(":").trim();
      if (!label || !value) return null;
      return { label: label.trim(), value };
    })
    .filter((s): s is { label: string; value: string } => s !== null);

  if (sections.length === 0) return summary;

  const find = (key: string) => sections.find((s) => s.label.includes(key))?.value;
  const category = find("カテゴリ");
  const elements = find("要素");

  const clauses: string[] = [];
  if (category) clauses.push(`${category}に関心が高く`);
  if (elements) clauses.push(`${elements}といった要素に惹かれる傾向があります`);

  return clauses.length > 0
    ? `${clauses.join("、")}${elements ? "" : "が好みの傾向です"}。`
    : `${sections
        .filter((s) => !s.label.includes("価格"))
        .map((s) => s.value)
        .join("、")}が好みの傾向です。`;
}

/** フロー 5: 厳選したおすすめスポット一覧（ai-recommendations）。 */
export function RecommendationsScreen({
  recommendations,
  diagnosisComplete,
  userId,
  onStartDiagnosis,
  onRestart,
  onGoHome,
  onOpenSpot,
  profileSummary = "",
}: RecommendationsScreenProps) {
  const listSource = diagnosisComplete ? recommendations : EXPLORE_SPOTS;
  const [initiallyVisitedIds] = useState<Set<string>>(
    () =>
      new Set(
        diagnosisComplete
          ? recommendations.filter((rec) => isVisited(userId, rec.id)).map((rec) => rec.id)
          : [],
      ),
  );
  const [visibleCount, setVisibleCount] = useState(RECOMMENDATIONS_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const visibleRecommendations = listSource.filter((rec) => !initiallyVisitedIds.has(rec.id));
  const displayedRecommendations = visibleRecommendations.slice(0, visibleCount);
  const hasMore = visibleCount < visibleRecommendations.length;

  // カテゴリ配色設定
  const CAT: Record<string, { l: string; c: string }> = {
    歴史: { l: "歴史", c: "bg-blue-600" },
    自然: { l: "自然", c: "bg-teal-600" },
    グルメ: { l: "グルメ", c: "bg-amber-600" },
    観光: { l: "観光", c: "bg-slate-600" },
  };

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

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

        {/* ① AIによる好みの概要 */}
        {diagnosisComplete && profileSummary && (
          <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-linear-to-br from-[#ecfdf5] via-white to-[#eef2ff] p-px shadow-[0_8px_30px_-12px_rgba(10,161,155,0.45)]">
            {/* 装飾用グロー */}
            <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-[#0aa19b]/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 size-28 rounded-full bg-[#23ac73]/15 blur-3xl" />

            <div className="relative rounded-[15px] bg-white/70 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex flex-col">
                  <p className="text-[14px] font-extrabold tracking-tight text-[#0f172a]">
                    好みの傾向
                  </p>
                  <p className="text-[10.5px] font-medium text-slate-400">
                    回答結果から診断しました
                  </p>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-slate-600">
                {buildPreferenceSentence(profileSummary)}
              </p>
            </div>
          </div>
        )}

        {!diagnosisComplete && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3">
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-bold text-[#0f172a]">好み診断でさらに絞り込む</p>
              <p className="text-[12px] leading-[1.6] text-[#64748b]">
                スワイプで好みを教えていただくと、あなたに合ったおすすめを表示できます。
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
          <p className="text-[12px] font-semibold text-[#64748b]">小諸のスポット</p>
        )}

        {!diagnosisComplete && visibleRecommendations.length > 0 && (
          <div className="grid grid-cols-2 gap-3 w-full">
            {displayedRecommendations.map((rec, index) => {
              const cat = CAT[rec.category] || { l: rec.category, c: "bg-slate-600" };

              return (
                <Fragment key={rec.id}>
                  <article className="relative aspect-square shrink-0 overflow-hidden rounded-xl border border-[#e2e8f0] bg-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition active:scale-[0.99] w-full">
                    <button
                      type="button"
                      onClick={() => onOpenSpot(rec)}
                      aria-label={`${rec.name} の詳細を見る`}
                      className="absolute inset-0 w-full text-left transition"
                    >
                      <img
                        src={rec.image}
                        alt={rec.name}
                        className="absolute inset-0 size-full object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
                      <span className="absolute top-1.5 left-1.5 inline-block rounded-md bg-slate-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {cat.l}
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
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16 text-center">
            <p className="text-[15px] font-bold text-[#0f172a]">
              おすすめのスポットが見つかりませんでした
            </p>
            <p className="text-[13px] text-[#64748b]">もう一度好み診断を行ってください。</p>
            <button
              type="button"
              onClick={onGoHome}
              className={`${PRIMARY_BUTTON} h-16 tracking-wider mt-2 px-6 py-3 text-[14px]`}
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
              const cat = CAT[rec.category] || { l: rec.category, c: "bg-slate-600" };

              return (
                <Fragment key={rec.id}>
                  <article className="relative aspect-square shrink-0 overflow-hidden rounded-xl border border-[#e2e8f0] bg-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition active:scale-[0.99] w-full">
                    <button
                      type="button"
                      onClick={() => onOpenSpot(rec)}
                      aria-label={`${rec.name} の詳細を見る`}
                      className="absolute inset-0 w-full text-left transition"
                    >
                      <img
                        src={rec.image}
                        alt={rec.name}
                        className="absolute inset-0 size-full object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
                      <span className="absolute top-1.5 left-1.5 inline-block rounded-md bg-slate-600/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {cat.l}
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
                        onClick={onRestart}
                        className={`${PRIMARY_BUTTON} relative h-8 shrink-0 overflow-hidden py-8 text-[15px] tracking-[1.6px]`}
                      >
                        <CardsIcon className="pointer-events-none absolute left-4 top-3/5 size-24 -translate-y-1/2 text-white/30 opacity-50" />
                        <span className="relative text-shadow-md">好みをより詳しく設定する</span>
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
            <div className="size-6 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a]" />
          </div>
        )}

        {visibleRecommendations.length > 0 && !hasMore && (
          <button
            type="button"
            onClick={onGoHome}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white py-3 text-[14px] font-semibold text-[#475569] transition active:scale-[0.98] active:bg-[#f1f5f9]"
          >
            ホームに戻る
            <ChevronRightIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

import { Fragment, useEffect, useRef, useState } from "react";
import { AiGuideAvatar } from "../components/AiGuideAvatar.tsx";
import { AiGuideSpeechBubble } from "../components/AiGuideSpeechBubble.tsx";
import { CardsIcon, ChevronRightIcon, MapPinIcon } from "../components/icons.tsx";
import { SpotImage } from "../components/SpotImage.tsx";
import { RECOMMENDATIONS_PAGE_SIZE, type Recommendation } from "../data/spots.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { isVisited } from "../lib/visited.ts";

type RecommendationsScreenProps = {
  recommendations: Recommendation[];
  plan?: {
    type: "spot" | "break";
    timeSlot: string;
    spot?: Recommendation;
    title: string;
    description: string;
  }[];
  /** API から取得した探索用スポット（診断前）。 */
  exploreSpots?: Recommendation[];
  /** 探索スポット見出し用のエリア名。 */
  destinationArea?: string;
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
  /** おすすめが空のときに表示する補足メッセージ */
  emptyMessage?: string;
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
  plan = [],
  exploreSpots = [],
  destinationArea = "小諸市",
  diagnosisComplete,
  userId,
  onStartDiagnosis,
  onRestart,
  onGoHome,
  onOpenSpot,
  profileSummary = "",
  emptyMessage = "",
}: RecommendationsScreenProps) {
  const listSource = diagnosisComplete ? recommendations : exploreSpots;
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

  // タイムラインに組み込まれているスポットIDを抽出してフィルタリング
  const planSpotIds = new Set(
    (plan ?? [])
      .filter((item) => item.type === "spot" && item.spot)
      .map((item) => item.spot!.id)
  );

  const visibleRecommendations = listSource
    .filter((rec) => !initiallyVisitedIds.has(rec.id))
    .filter((rec) => !planSpotIds.has(rec.id));
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
        {diagnosisComplete && profileSummary && visibleRecommendations.length > 0 && (
          <div className="flex items-end gap-1">
            <AiGuideAvatar size={40} className="shrink-0" />
            <AiGuideSpeechBubble>
              <span className="text-[13px]">{buildPreferenceSentence(profileSummary)}</span>
            </AiGuideSpeechBubble>
          </div>
        )}

        {/* AIガイドによるルート全体の解説・おすすめポイント */}
        {diagnosisComplete && emptyMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/20 p-4 mt-1">
            <AiGuideAvatar size={40} className="shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-bold text-teal-800 tracking-wider">💡 このプランのおすすめポイント</span>
              <p className="text-[13px] leading-relaxed text-slate-700 font-medium">
                {emptyMessage}
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
          <p className="text-[12px] font-semibold text-[#64748b]">{destinationArea}のスポット</p>
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
                      <SpotImage
                        src={rec.image}
                        alt={rec.name}
                        className="absolute inset-0 size-full object-cover"
                        priority={index < 4}
                        lazy={index >= 4}
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

        {/* ② AI旅程タイムラインプラン */}
        {diagnosisComplete && plan && plan.length > 0 && (
          <div className="flex flex-col gap-4 mt-2">
            <h3 className="text-[15px] font-extrabold text-[#0f172a] border-b border-slate-100 pb-2">
              📍 あなたのための旅程プラン
            </h3>
            <div className="relative flex flex-col pl-4 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {plan.map((item, index) => {
                const isSpot = item.type === "spot" && item.spot;
                
                return (
                  <div key={index} className="relative flex gap-4 pb-6 last:pb-2">
                    {/* タイムラインのノード/丸 */}
                    <div className={`absolute left-0 top-1 flex size-9 items-center justify-center rounded-full border bg-white ${
                      isSpot ? "border-teal-600 ring-2 ring-teal-50" : "border-amber-500 ring-2 ring-amber-50"
                    } -translate-x-1/2 shadow-xs`}>
                      {isSpot ? (
                        <span className="size-2.5 rounded-full bg-teal-600" />
                      ) : (
                        <span className="text-[12px] font-bold text-amber-500">☕</span>
                      )}
                    </div>

                    {/* コンテンツカード */}
                    <div className="flex-1 pl-6 flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 uppercase tracking-wider">
                          {item.timeSlot}
                        </span>
                        {isSpot && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                            CAT[item.spot!.category]?.c || "bg-slate-600"
                          }`}>
                            {CAT[item.spot!.category]?.l || item.spot!.category}
                          </span>
                        )}
                      </div>
                      
                      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.03)] flex flex-col gap-2">
                        <p className="text-[15px] font-extrabold text-[#0f172a]">
                          {item.title}
                        </p>
                        <p className="text-[12px] leading-relaxed text-[#64748b]">
                          {item.description}
                        </p>
                        
                        {isSpot && (
                          <button
                            type="button"
                            onClick={() => onOpenSpot(item.spot!)}
                            className="mt-2 flex overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition active:scale-[0.99] text-left w-full h-[80px]"
                          >
                            <SpotImage
                              src={item.spot!.image}
                              alt={item.spot!.name}
                              className="w-[100px] h-full object-cover shrink-0"
                            />
                            <div className="p-3 flex flex-col justify-center min-w-0">
                              <p className="text-[13px] font-bold text-[#0f172a] truncate">
                                {item.spot!.name}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                📍 {item.spot!.prefecture} / {item.spot!.area}
                              </p>
                            </div>
                            <div className="ml-auto pr-3 flex items-center shrink-0">
                              <ChevronRightIcon className="size-4 text-slate-300" />
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {diagnosisComplete && visibleRecommendations.length === 0 && (!plan || plan.length === 0) && (
          <div className="flex flex-1 flex-col justify-center gap-8 py-16">
            <div className="flex items-end gap-1">
              <AiGuideAvatar size={44} className="shrink-0" />
              <AiGuideSpeechBubble>
                <span className="text-[13px] font-bold text-[#0f172a]">
                  おすすめのスポットが見つかりませんでした
                </span>
                <span className="text-[13px]">
                  {emptyMessage ||
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

        {/* ③ 他のサブおすすめカード */}
        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <div className="flex flex-col gap-4 mt-6">
            <h3 className="text-[15px] font-extrabold text-[#0f172a] border-b border-slate-100 pb-2">
              ✨ 他にもこんなスポットがあなたにおすすめ
            </h3>
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
                        <SpotImage
                          src={rec.image}
                          alt={rec.name}
                          className="absolute inset-0 size-full object-cover"
                          priority={index < 4}
                          lazy={index >= 4}
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

                    {(index + 1) % 10 === 0 && visibleRecommendations.length > 10 && (
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
          </div>
        )}

        {diagnosisComplete && hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-2">
            <div className="size-6 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a]" />
          </div>
        )}

        {visibleRecommendations.length > 0 && !hasMore && (
          <div className="mt-6 flex flex-col gap-3">
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

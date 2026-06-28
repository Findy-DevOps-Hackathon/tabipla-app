import { Fragment, useEffect, useRef, useState } from "react";
import { CardsIcon, SparklesIcon } from "../components/icons.tsx";
import { RECOMMENDATIONS_PAGE_SIZE, type Recommendation } from "../data/spots.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { isVisited } from "../lib/visited.ts";

type RecommendationsScreenProps = {
  recommendations: Recommendation[];
  /** 好み診断を完了済みか。 */
  diagnosisComplete: boolean;
  /** 「好みをより詳しく設定する」を済ませたか。 */
  detailedComplete: boolean;
  /** ユーザーの ID。 */
  userId: string;
  /** 「好み診断を開始する」タップ時。 */
  onStartDiagnosis: () => void;
  /** 「好みを再学習する」タップ時。 */
  onRestart: () => void;
  /** スポット詳細を開く。 */
  onOpenSpot: (recommendation: Recommendation) => void;
  /** 作戦会議ログ（エージェント間ディベート） */
  debateLog?: { agent: string; message: string }[];
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
  debateLog = [],
}: RecommendationsScreenProps) {
  const [initiallyVisitedIds] = useState<Set<string>>(
    () => new Set(recommendations.filter((rec) => isVisited(userId, rec.id)).map((rec) => rec.id)),
  );
  const [visibleCount, setVisibleCount] = useState(RECOMMENDATIONS_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const visibleRecommendations = recommendations.filter((rec) => !initiallyVisitedIds.has(rec.id));
  const displayedRecommendations = visibleRecommendations.slice(0, visibleCount);
  const hasMore = visibleCount < visibleRecommendations.length;

  // --- エージェント機能用の React 状態 --------------------------------------
  const [isDebateOpen, setIsDebateOpen] = useState(false);
  const [spotFeedbacks, setSpotFeedbacks] = useState<Record<string, "good" | "bad">>({});

  // 全体フィードバック状態
  const [tripRating, setTripRating] = useState(0);
  const [tripComment, setTripComment] = useState("");
  const [isSubmittingTripFeedback, setIsSubmittingTripFeedback] = useState(false);
  const [tripFeedbackResult, setTripFeedbackResult] = useState<{ feedbackNotes: string; introStyle: string } | null>(null);

  // カテゴリ配色設定
  const CAT: Record<string, { l: string; c: string }> = {
    "歴史": { l: "歴史", c: "bg-blue-600" },
    "自然": { l: "自然", c: "bg-teal-600" },
    "グルメ": { l: "グルメ", c: "bg-amber-600" },
    "観光": { l: "観光", c: "bg-slate-600" },
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

  // --- 個別スポットGood/Bad送信 ------------------------------------------
  async function handleSpotFeedback(spotId: string, rating: "good" | "bad") {
    setSpotFeedbacks((prev) => ({ ...prev, [spotId]: rating }));

    try {
      await fetch("/api/v1/personalized/feedback/spot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, spotId, rating }),
      });
    } catch (e) {
      console.error("スポットフィードバック送信に失敗しました:", e);
    }
  }

  // --- 対話ログ内のスポット名をクリック可能にする -----------------------------
  function renderDebateMessage(message: string) {
    if (!message) return "";

    const spotNames = recommendations.map((r) => r.name);
    const escapedNames = spotNames
      .filter(Boolean)
      .map((name) => name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"));

    let regex = /([^\s(（]+)\s*[(（](s\d+)[)）]/g;
    if (escapedNames.length > 0) {
      const namesPattern = escapedNames.join("|");
      regex = new RegExp(`(${namesPattern})\\s*[(（](s\\d+)[)）]`, "g");
    }

    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(message)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(message.substring(lastIndex, matchIndex));
      }

      const spotName = match[1];
      const spotId = match[2];

      const rec = recommendations.find((r) => r.id === spotId);

      if (rec) {
        parts.push(
          <button
            key={matchIndex}
            type="button"
            onClick={() => onOpenSpot(rec)}
            className="font-extrabold text-teal-600 hover:text-teal-800 hover:underline inline-block mx-0.5"
          >
            {spotName}({spotId})
          </button>
        );
      } else {
        parts.push(`${spotName}(${spotId})`);
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < message.length) {
      parts.push(message.substring(lastIndex));
    }

    return <span className="whitespace-pre-wrap text-left break-words block w-full">{parts.length > 0 ? parts : message}</span>;
  }

  // --- 全体フィードバック送信 --------------------------------------------
  async function submitTripFeedback() {
    if (tripRating === 0) {
      alert("星評価（1〜5）を選択してください。");
      return;
    }

    setIsSubmittingTripFeedback(true);

    const spotFeedbacksList = Object.entries(spotFeedbacks).map(([spotId, rating]) => ({
      spotId,
      rating,
    }));

    try {
      const res = await fetch("/api/v1/personalized/feedback/trip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          rating: tripRating,
          comment: tripComment,
          spotFeedbacks: spotFeedbacksList,
        }),
      });

      const data = await res.json();
      setTripFeedbackResult({
        feedbackNotes: data.feedbackNotes || "特になし",
        introStyle: data.introStyle || "特になし",
      });
    } catch (e: any) {
      alert(`フィードバック送信に失敗しました: ${e.message}`);
    } finally {
      setIsSubmittingTripFeedback(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-(--page)">
      <div className="flex flex-1 flex-col gap-4 p-4 pb-20">
        <div className="flex flex-col gap-0.5">
          <p className="w-fit bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-extrabold text-transparent">
            tabipla
          </p>
          <p className="text-[17px] font-extrabold text-[#0f172a]">あなたへのおすすめプラン</p>
        </div>

        {/* ① AIエージェント作戦会議ログ */}
        {diagnosisComplete && debateLog.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setIsDebateOpen(!isDebateOpen)}
              className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left text-[14px] font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              <span className="flex items-center gap-1.5">
                👥 AIエージェントたちの作戦会議ログ ({debateLog.length}件の発言)
              </span>
              <span>{isDebateOpen ? "▲" : "▼"}</span>
            </button>
            
            {isDebateOpen && (
              <div className="flex flex-col gap-2 p-3 max-h-[300px] overflow-y-auto border-t border-slate-100 bg-slate-50/50 text-[13px] leading-relaxed text-left w-full">
                {debateLog.map((log, i) => {
                  const agentNames: Record<string, string> = {
                    recommend: "🔵 推薦エージェント",
                    route: "🟢 ルート計画エージェント",
                    introduce: "🟠 紹介エージェント",
                  };
                  const colorClass = log.agent === "recommend" ? "border-l-4 border-blue-500 bg-blue-50/40" 
                    : log.agent === "route" ? "border-l-4 border-green-500 bg-green-50/40"
                    : "border-l-4 border-amber-500 bg-amber-50/40";
                  
                  return (
                    <div key={i} className={`p-2.5 rounded-r-md text-left w-full break-words ${colorClass}`}>
                      <strong className="block text-[11px] text-slate-500 mb-0.5">{agentNames[log.agent] || log.agent}</strong>
                      {renderDebateMessage(log.message)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
              おすすめのスポットが見つかりませんでした
            </p>
            <p className="text-[13px] text-[#64748b]">
              もう一度好み診断を行っていただくか、しばらく時間を置いてからお試しください。
            </p>
          </div>
        )}

        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <p className="text-[12px] font-semibold text-[#64748b]">AIエージェント合意ルート順</p>
        )}

        {diagnosisComplete &&
          displayedRecommendations.map((rec, index) => {
            const cat = CAT[rec.category] || { l: rec.category, c: "bg-slate-600" };
            const feedbackVal = spotFeedbacks[rec.id];

            return (
              <Fragment key={rec.id}>
                <article className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                  {/* スポット画像と名前 */}
                  <button
                    type="button"
                    onClick={() => onOpenSpot(rec)}
                    aria-label={`${rec.name} の詳細を見る`}
                    className="flex flex-col text-left transition active:opacity-95"
                  >
                    <div className="relative aspect-16/10 w-full bg-slate-100">
                      <img
                        src={rec.image}
                        alt={rec.name}
                        className="absolute inset-0 size-full object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-transparent" />
                      <div className="absolute top-3 left-3 rounded px-2 py-0.5 text-[11px] font-bold text-white bg-black/40">
                        Match {rec.match}%
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4">
                        <p className="text-[11px] font-medium text-white/80">
                          {rec.prefecture} / {rec.area}
                        </p>
                        <p className="text-[20px] font-extrabold leading-tight text-white drop-shadow-sm">
                          {rec.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 p-4">
                      {/* 推薦理由 */}
                      <div className="flex items-start gap-1.5 rounded-md bg-(--ai-bg) px-2.5 py-2">
                        <SparklesIcon className="size-3.5 mt-0.5 shrink-0 text-(--ai-fg)" />
                        <p className="text-[12px] font-semibold text-(--ai-fg) leading-relaxed">{rec.reason}</p>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <span className={`rounded-md ${cat.c} px-2 py-0.5 text-[11px] font-bold text-white`}>
                          {cat.l}
                        </span>
                        {rec.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-[#e2e8f0] px-2 py-0.5 text-[11px] text-[#475569]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>

                      <p className="text-[13px] text-slate-600 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                        {rec.description}
                      </p>
                    </div>
                  </button>

                  <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 bg-slate-50/30">
                    <div className="flex items-center justify-between">
                      {/* ② スポット個別 Good/Bad フィードバック */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSpotFeedback(rec.id, "good")}
                          className={`flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[12px] font-medium transition ${
                            feedbackVal === "good"
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          👍 Good
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSpotFeedback(rec.id, "bad")}
                          className={`flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[12px] font-medium transition ${
                            feedbackVal === "bad"
                              ? "bg-rose-600 text-white border-rose-600"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          👎 Bad
                        </button>
                      </div>

                      {/* ③ AIガイド起動トリガー（詳細モーダルへ誘導） */}
                      <button
                        type="button"
                        onClick={() => onOpenSpot(rec)}
                        className="text-[12px] font-bold text-teal-600 hover:underline flex items-center gap-1"
                      >
                        💬 AIガイドに質問する
                      </button>
                    </div>
                  </div>
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
            );
          })}

        {/* ④ 旅行終了後の全体フィードバックフォーム */}
        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col gap-4">
            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-1.5">
              🏁 旅行終了フィードバック
            </h3>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              今回のAIプラン提案やエージェントの解説はいかがでしたか？星評価とコメントをお送りいただくと、AIが好みを学習して次回以降の精度が向上します。
            </p>

            {/* 星評価（1〜5） */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-600 mr-1">保持:</span>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setTripRating(star)}
                  className={`text-[28px] transition ${
                    star <= tripRating ? "text-amber-400 drop-shadow-xs scale-110" : "text-slate-200"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* コメント入力 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tripComment" className="text-[12px] font-bold text-slate-600">感想コメント</label>
              <textarea
                id="tripComment"
                value={tripComment}
                onChange={(e) => setTripComment(e.target.value)}
                placeholder="例）もう少しのんびりできる歴史スポットがよかった、紹介スタイルはフランクな方が好き"
                rows={3}
                className="w-full rounded-xl border border-slate-200 p-3 text-[13px] focus:outline-teal-600 bg-slate-50/50"
              />
            </div>

            <button
              type="button"
              onClick={submitTripFeedback}
              disabled={isSubmittingTripFeedback || tripRating === 0}
              className={`${PRIMARY_BUTTON} py-3 text-[14px] font-bold ${
                tripRating === 0 ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isSubmittingTripFeedback ? "送信してAIが自己学習中..." : "フィードバックを送信して学習させる"}
            </button>

            {/* 学習結果の表示エリア */}
            {tripFeedbackResult && (
              <div className="mt-2 rounded-xl bg-teal-50 border border-teal-100 p-4 text-[13px] text-teal-800 leading-relaxed shadow-xs flex flex-col gap-2 whitespace-pre-wrap">
                <p className="font-bold text-[14px] text-teal-900 flex items-center gap-1">
                  🧠 AIエージェントが自己学習を完了しました！
                </p>
                <div>
                  <strong className="block text-[11px] text-teal-600 font-bold tracking-wider uppercase">推薦の好み傾向メモ (feedbackNotes):</strong>
                  <p className="mt-0.5">{tripFeedbackResult.feedbackNotes}</p>
                </div>
                <div className="mt-1">
                  <strong className="block text-[11px] text-teal-600 font-bold tracking-wider uppercase">紹介スタイル (introStyle):</strong>
                  <p className="mt-0.5">{tripFeedbackResult.introStyle}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {diagnosisComplete && hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-2">
            <div className="size-6 animate-spin rounded-full border-2 border-[#e2e8f0] border-t-[#0f172a]" />
          </div>
        )}
      </div>
    </div>
  );
}

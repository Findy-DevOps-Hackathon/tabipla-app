import { Fragment, useEffect, useRef, useState } from "react";
import { CardsIcon } from "../components/icons.tsx";
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
  debateLog?: { agent: string; message: string; thought?: string }[];
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
  const [tripFeedbackResult, setTripFeedbackResult] = useState<{
    feedbackNotes: string;
    introStyle: string;
  } | null>(null);

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

    const generateAliases = (name: string): string[] => {
      const aliases = [name];
      const noBrackets = name.replace(/[(（].*?[)）]/g, "").trim();
      if (noBrackets && noBrackets !== name) {
        aliases.push(noBrackets);
      }

      const parts = name.split(/[\s　]+/);
      if (parts.length > 1) {
        parts.forEach((p) => {
          const trimmed = p.trim();
          if (trimmed && trimmed.length >= 2 && !aliases.includes(trimmed)) {
            aliases.push(trimmed);
          }
        });
      }

      const suffixRegex =
        /(?:小諸ワイナリー|ワイナリー|こもろ|サイクリングロード|眺望スポット|パティスリー)$/g;
      const noSuffix = noBrackets.replace(suffixRegex, "").trim();
      if (noSuffix && noSuffix.length >= 2 && !aliases.includes(noSuffix)) {
        aliases.push(noSuffix);
      }

      const noPrefix = noBrackets.replace(/^(?:そば処|千曲川|千曲川流域の)\s*/, "").trim();
      if (noPrefix && noPrefix.length >= 2 && !aliases.includes(noPrefix)) {
        aliases.push(noPrefix);
      }

      const noYu = noBrackets
        .replace(/こもろ$/, "")
        .replace(/の湯$/, "")
        .trim();
      if (noYu && noYu.length >= 2 && !aliases.includes(noYu)) {
        aliases.push(noYu);
      }

      return aliases;
    };

    // 一般的な単語や都市名などのブラックリスト（誤検出・誤リンク防止）
    const BLACKLIST_WORDS = [
      "小諸",
      "小諸市",
      "長野県",
      "酒蔵",
      "温泉",
      "カフェ",
      "スイーツ",
      "ランチ",
      "絶景",
      "歴史",
    ];

    const keywordPairs: { keyword: string; escaped: string; id: string; rec: Recommendation }[] =
      [];
    const keywordToIds: Record<string, string[]> = {};

    recommendations.forEach((rec) => {
      const aliases = generateAliases(rec.name);
      aliases.forEach((alias) => {
        if (!alias) return;
        if (BLACKLIST_WORDS.includes(alias)) return;

        if (!keywordToIds[alias]) {
          keywordToIds[alias] = [];
        }
        if (!keywordToIds[alias].includes(rec.id)) {
          keywordToIds[alias].push(rec.id);
        }

        keywordPairs.push({
          keyword: alias,
          escaped: alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
          id: rec.id,
          rec,
        });
      });
    });

    // 重複チェック：複数の異なるスポットに対して同一の略称（キーワード）が紐づいた場合、
    // 誤リンクを防止するためにそのキーワードはエイリアスリストから完全に除外する。
    const uniqueKeywordPairs = keywordPairs.filter((p) => {
      const ids = keywordToIds[p.keyword] || [];
      return ids.length === 1;
    });

    uniqueKeywordPairs.sort((a, b) => b.keyword.length - a.keyword.length);

    if (uniqueKeywordPairs.length === 0) {
      return (
        <span className="whitespace-pre-wrap text-left break-words block w-full">{message}</span>
      );
    }

    const namesPattern = uniqueKeywordPairs.map((p) => p.escaped).join("|");
    const regex = new RegExp(`(${namesPattern})(?:\\s*[(（](s\\d+)[)）])?`, "g");

    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(message)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(message.substring(lastIndex, matchIndex));
      }

      const matchedName = match[1];
      const capturedId = match[2];

      const pair = uniqueKeywordPairs.find((p) =>
        capturedId ? p.id === capturedId : p.keyword === matchedName,
      );

      if (pair) {
        parts.push(
          <button
            key={matchIndex}
            type="button"
            onClick={() => onOpenSpot(pair.rec)}
            className="font-extrabold text-teal-600 hover:text-teal-800 hover:underline inline-block mx-0.5"
          >
            {pair.rec.name}
          </button>,
        );
      } else {
        parts.push(match[0]);
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < message.length) {
      parts.push(message.substring(lastIndex));
    }

    return (
      <span className="whitespace-pre-wrap text-left break-words block w-full">
        {parts.length > 0 ? parts : message}
      </span>
    );
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
              <div className="flex flex-col gap-3.5 p-3.5 max-h-[380px] overflow-y-auto border-t border-slate-100 bg-[#f8fafc] w-full shadow-inner">
                {debateLog.map((log, i) => {
                  const agentMeta: Record<
                    string,
                    {
                      name: string;
                      avatar: string;
                      avatarBg: string;
                      bubbleBg: string;
                      textClass: string;
                      border: string;
                    }
                  > = {
                    recommend: {
                      name: "推薦エージェント",
                      avatar: "推",
                      avatarBg: "bg-blue-600 text-white",
                      bubbleBg: "bg-blue-50/70",
                      textClass: "text-blue-950",
                      border: "border-blue-100/80",
                    },
                    route: {
                      name: "ルート計画エージェント",
                      avatar: "ル",
                      avatarBg: "bg-emerald-600 text-white",
                      bubbleBg: "bg-emerald-50/70",
                      textClass: "text-emerald-950",
                      border: "border-emerald-100/80",
                    },
                    introduce: {
                      name: "紹介エージェント",
                      avatar: "紹",
                      avatarBg: "bg-amber-600 text-white",
                      bubbleBg: "bg-amber-50/70",
                      textClass: "text-amber-950",
                      border: "border-amber-100/80",
                    },
                  };

                  const meta = agentMeta[log.agent] || {
                    name: log.agent,
                    avatar: "👤",
                    avatarBg: "bg-slate-500 text-white",
                    bubbleBg: "bg-slate-100",
                    textClass: "text-slate-800",
                    border: "border-slate-200",
                  };

                  return (
                    <div key={i} className="flex items-start gap-2.5 w-full text-left">
                      {/* アバター */}
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold shadow-xs ${meta.avatarBg}`}
                      >
                        {meta.avatar}
                      </div>

                      {/* メッセージ部 */}
                      <div className="flex flex-col gap-1 max-w-[85%]">
                        <span className="text-[10px] font-bold text-slate-400 px-0.5">
                          {meta.name}
                        </span>
                        <div
                          className={`rounded-2xl rounded-tl-xs border px-3.5 py-2.5 text-[12.5px] leading-relaxed shadow-2xs ${meta.bubbleBg} ${meta.border} ${meta.textClass}`}
                        >
                          {renderDebateMessage(log.message)}
                        </div>
                      </div>
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

        {diagnosisComplete && visibleRecommendations.length > 0 && (
          <div className="grid grid-cols-2 gap-3 w-full">
            {displayedRecommendations.map((rec, index) => {
              const cat = CAT[rec.category] || { l: rec.category, c: "bg-slate-600" };
              const feedbackVal = spotFeedbacks[rec.id];

              return (
                <Fragment key={rec.id}>
                  <article className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition active:scale-[0.99] w-full">
                    {/* スポット画像と名前 */}
                    <button
                      type="button"
                      onClick={() => onOpenSpot(rec)}
                      aria-label={`${rec.name} の詳細を見る`}
                      className="flex flex-col text-left transition flex-1 w-full"
                    >
                      <div className="relative aspect-[16/13] w-full bg-slate-100 shrink-0">
                        <img
                          src={rec.image}
                          alt={rec.name}
                          className="absolute inset-0 size-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                        <div className="absolute top-1.5 left-1.5 rounded px-1 py-0.2 text-[8px] font-bold text-white bg-black/40">
                          {rec.match}% Match
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-2">
                          <span
                            className={`inline-block rounded-xs ${cat.c} px-1.5 py-0.2 text-[8px] font-extrabold text-white mb-0.5`}
                          >
                            {cat.l}
                          </span>
                          <p className="text-[12px] font-extrabold leading-tight text-white drop-shadow-xs line-clamp-1">
                            {rec.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 p-2 flex-1 justify-between w-full">
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-normal whitespace-pre-wrap">
                          {rec.description}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5 bg-slate-50/30 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSpotFeedback(rec.id, "good");
                          }}
                          className={`flex items-center justify-center size-6 rounded-full border border-slate-200 text-[10px] transition ${
                            feedbackVal === "good"
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSpotFeedback(rec.id, "bad");
                          }}
                          className={`flex items-center justify-center size-6 rounded-full border border-slate-200 text-[10px] transition ${
                            feedbackVal === "bad"
                              ? "bg-rose-600 text-white border-rose-600"
                              : "bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          👎
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSpot(rec);
                        }}
                        className="text-[11px] font-bold text-teal-600 hover:underline flex items-center gap-0.5"
                      >
                        💬 質問
                      </button>
                    </div>
                  </article>

                  {!detailedComplete && (index + 1) % 10 === 0 && (
                    <div className="col-span-2 py-2">
                      <button
                        type="button"
                        onClick={onRestart}
                        className={`${PRIMARY_BUTTON} relative h-8 shrink-0 overflow-hidden py-8 text-[15px] tracking-[1.6px]`}
                      >
                        <CardsIcon className="pointer-events-none absolute left-4 top-3/5 size-24 -translate-y-1/2 text-white/30 opacity-50" />
                        <span className="relative text-shadow-md">好みをより詳しく分析する</span>
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}

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
                    star <= tripRating
                      ? "text-amber-400 drop-shadow-xs scale-110"
                      : "text-slate-200"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* コメント入力 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tripComment" className="text-[12px] font-bold text-slate-600">
                感想コメント
              </label>
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
              {isSubmittingTripFeedback
                ? "送信してAIが自己学習中..."
                : "フィードバックを送信して学習させる"}
            </button>

            {/* 学習結果の表示エリア */}
            {tripFeedbackResult && (
              <div className="mt-2 rounded-xl bg-teal-50 border border-teal-100 p-4 text-[13px] text-teal-800 leading-relaxed shadow-xs flex flex-col gap-2 whitespace-pre-wrap">
                <p className="font-bold text-[14px] text-teal-900 flex items-center gap-1">
                  🧠 AIエージェントが自己学習を完了しました！
                </p>
                <div>
                  <strong className="block text-[11px] text-teal-600 font-bold tracking-wider uppercase">
                    推薦の好み傾向メモ (feedbackNotes):
                  </strong>
                  <p className="mt-0.5">{tripFeedbackResult.feedbackNotes}</p>
                </div>
                <div className="mt-1">
                  <strong className="block text-[11px] text-teal-600 font-bold tracking-wider uppercase">
                    紹介スタイル (introStyle):
                  </strong>
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

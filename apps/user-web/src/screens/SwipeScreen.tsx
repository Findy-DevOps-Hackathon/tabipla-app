import { useCallback, useEffect, useRef, useState } from "react";
import { UndoIcon } from "../components/icons.tsx";
import { SpotImage } from "../components/SpotImage.tsx";
import type { SwipeSpot, SpotCategory } from "../data/spots.ts";
import { spotPreviewText } from "../lib/spotMapper.ts";

type SwipeScreenProps = {
  refine?: boolean;
  /** 全ラウンド完了時。likes（勝者ID）と nopes（敗者ID）の最終配列を親に渡す */
  onComplete: (likedIds: string[], nopedIds: string[]) => void;
  onCancel: () => void;
};

type SwipeHistoryEntry = {
  likes: string[];
  nopes: string[];
  spotA: SwipeSpot;
  spotB: SwipeSpot;
};

const API_BASE = "/api";

// 基準観光地用の美麗な Unsplash 画像マッピング (Rich Aesthetics)
const SPOT_IMAGES: Record<string, string> = {
  "ref-01": "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=600&q=80", // 清水寺
  "ref-02": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80", // 金閣寺
  "ref-03": "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80", // 伏見稲荷
  "ref-04": "https://images.unsplash.com/photo-1590224796214-368f9a2fb6e5?auto=format&fit=crop&w=600&q=80", // 姫路城
  "ref-05": "https://images.unsplash.com/photo-1504198453319-5ce911bafcde?auto=format&fit=crop&w=600&q=80", // 厳島神社
  "ref-06": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=80", // 浅草寺
  "ref-07": "https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=600&q=80", // 日光東照宮
  "ref-08": "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=600&q=80", // 伊勢神宮
  "ref-09": "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=600&q=80", // 出雲大社
  "ref-10": "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=600&q=80", // 富士山五合目
  "ref-11": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80", // 上高地
  "ref-12": "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80", // 大雪山
  "ref-13": "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80", // 阿蘇山
  "ref-14": "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=600&q=80", // 鳥取砂丘
  "ref-15": "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80", // 白谷雲水峡
  "ref-16": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80", // 奥入瀬渓流
  "ref-17": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80", // 高千穂峡
  "ref-18": "https://images.unsplash.com/photo-1546026423-cc4642628d2b?auto=format&fit=crop&w=600&q=80", // 美ら海水族館
  "ref-19": "https://images.unsplash.com/photo-1513829096960-ef0412df7b53?auto=format&fit=crop&w=600&q=80", // USJ
  "ref-20": "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?auto=format&fit=crop&w=600&q=80", // 東京スカイツリー
  "ref-21": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80", // 金沢21世紀美術館
  "ref-22": "https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?auto=format&fit=crop&w=600&q=80", // 大塚国際美術館
  "ref-23": "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80", // ジブリ美術館
  "ref-24": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=600&q=80", // 日本科学未来館
  "ref-25": "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=600&q=80", // 箱根彫刻の森美術館
  "ref-26": "https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=600&q=80", // 横浜中華街
  "ref-27": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80", // 築地場外市場
  "ref-28": "https://images.unsplash.com/photo-1590256695277-2d4ff9000a6e?auto=format&fit=crop&w=600&q=80", // 道頓堀
  "ref-29": "https://images.unsplash.com/photo-1534080391025-a87b4f145763?auto=format&fit=crop&w=600&q=80", // ひがし茶屋街
  "ref-30": "https://images.unsplash.com/photo-1542044896530-05d85be9b11a?auto=format&fit=crop&w=600&q=80", // 草津温泉
  "ref-31": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=600&q=80", // 有馬温泉
  "ref-32": "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=600&q=80", // 別府地獄めぐり
  "ref-33": "https://images.unsplash.com/photo-1542044896530-05d85be9b11a?auto=format&fit=crop&w=600&q=80", // 城崎温泉
  "ref-34": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=600&q=80", // ニセコ
  "ref-35": "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=600&q=80", // 琵琶湖カヤック
  "ref-36": "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80", // しまなみ海道
  "ref-37": "https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=600&q=80", // みなかみラフティング
  "ref-38": "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80", // 小樽運河
  "ref-39": "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80", // 川越蔵造り
  "ref-40": "https://images.unsplash.com/photo-1508193638397-1c4234db14d8?auto=format&fit=crop&w=600&q=80", // 白川郷
  "ref-41": "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=600&q=80", // 角島大橋
  "ref-42": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80", // 美瑛青い池
  "ref-43": "https://images.unsplash.com/photo-1504618223053-559bdef9dd5a?auto=format&fit=crop&w=600&q=80", // 兼六園
  "ref-44": "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=600&q=80", // 那智の滝
  "ref-45": "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80", // 中村藤吉
  "ref-46": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80", // 高野山奥之院
  "ref-47": "https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=600&q=80", // ひたち海浜公園
  "ref-48": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80", // 神戸北野異人館
  "ref-49": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=80", // 軽井沢ハルニレ
  "ref-50": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80", // 竹田城跡
};

const DEFAULT_SPOT_IMAGE = "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80";

function mapToSwipeSpot(spot: any): SwipeSpot {
  return {
    id: spot.id,
    name: spot.name,
    prefecture: spot.prefecture || "",
    area: spot.area || "",
    category: (Array.isArray(spot.category) ? spot.category[0] : spot.category) as SpotCategory || "観光",
    description: spot.description,
    trivia: spot.description,
    tags: spot.tags || [],
    image: SPOT_IMAGES[spot.id] || DEFAULT_SPOT_IMAGE,
  };
}

type ComparisonCardProps = {
  spot: SwipeSpot;
  position: "top" | "bottom";
  disabled: boolean;
  selected: boolean;
  rejected: boolean;
  wiggle: boolean;
  onSelect: () => void;
};

/** 比較カード用：おすすめポイントまたは紹介文の先頭文。 */
function comparisonPreview(spot: SwipeSpot): string {
  return spotPreviewText(spot);
}

function ComparisonCard({
  spot,
  position,
  disabled,
  selected,
  rejected,
  wiggle,
  onSelect,
}: ComparisonCardProps) {
  const showWiggle = wiggle && !selected && !rejected;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-label={`${spot.name}を選ぶ`}
      style={{
        transition: showWiggle
          ? "opacity 0.28s ease-out, box-shadow 0.28s ease-out"
          : "transform 0.28s ease-out, opacity 0.28s ease-out, box-shadow 0.28s ease-out",
        transform: selected ? "scale(1.02)" : rejected ? "scale(0.98)" : undefined,
        opacity: rejected ? 0.45 : 1,
        boxShadow: selected
          ? "0 0 48px rgba(16,185,129,0.45), 0 8px 28px rgba(16,185,129,0.35)"
          : "0 12px 32px rgba(15,23,42,0.1)",
      }}
      className={`relative flex w-full touch-manipulation flex-col overflow-hidden rounded-2xl bg-white text-left disabled:cursor-not-allowed ${
        position === "top" ? "origin-top" : "origin-bottom"
      } ${showWiggle ? (position === "top" ? "animate-compare-hint-top" : "animate-compare-hint-bottom") : ""}`}
    >
      <div className="relative h-[230px] w-full">
        <SpotImage
          src={spot.image}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
          priority
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/10 from-30% to-black/80" />
        <span className="absolute left-3 top-3 inline-block rounded-md bg-slate-600/90 px-2.5 py-1 text-[12px] font-bold text-white">
          {spot.category}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-4">
          <p className="text-[15px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {spot.name}
          </p>
          <p className="text-[13px] leading-relaxed font-medium text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {comparisonPreview(spot)}
          </p>
        </div>
      </div>
    </button>
  );
}

export function SwipeScreen({ onComplete, refine = false, onCancel }: SwipeScreenProps) {
  const [likes, setLikes] = useState<string[]>([]);
  const [nopes, setNopes] = useState<string[]>([]);
  const [currentPair, setCurrentPair] = useState<{ spotA: SwipeSpot; spotB: SwipeSpot } | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [pick, setPick] = useState<{ winnerId: string; loserId: string } | null>(null);
  const [hintActive, setHintActive] = useState(true);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);

  const completedRef = useRef(false);
  const hintTimerRef = useRef<number | null>(null);

  // APIを呼び出して次のペアを取得する
  const fetchNextPair = useCallback(async (currentLikes: string[], currentNopes: string[]) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/diagnosis/next-pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likes: currentLikes, nopes: currentNopes }),
      });
      const data = await res.json();

      if (data.isComplete || !data.spotA || !data.spotB) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete(currentLikes, currentNopes);
        }
      } else {
        setCurrentPair({
          spotA: mapToSwipeSpot(data.spotA),
          spotB: mapToSwipeSpot(data.spotB),
        });
        setRoundIndex(data.roundIndex);
      }
    } catch (error) {
      console.error("次のペアの取得に失敗しました:", error);
    } finally {
      setLoading(false);
    }
  }, [onComplete]);

  // 初回マウント時に最初のペアをフェッチ
  useEffect(() => {
    fetchNextPair([], []);
  }, [fetchNextPair]);

  const playHint = useCallback(() => {
    setHintActive(true);
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHintActive(false), 1300);
  }, []);

  useEffect(() => {
    if (currentPair) {
      playHint();
    }
    return () => {
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    };
  }, [currentPair, playHint]);

  function pickWinner(winnerId: string, loserId: string) {
    if (locked || !currentPair) return;
    setHintActive(false);
    setLocked(true);
    setPick({ winnerId, loserId });

    const nextLikes = [...likes, winnerId];
    const nextNopes = [...nopes, loserId];

    // 履歴に現在の状態をスタック（Undo用）
    setHistory((prev) => [
      ...prev,
      {
        likes,
        nopes,
        spotA: currentPair.spotA,
        spotB: currentPair.spotB,
      },
    ]);

    window.setTimeout(() => {
      setLikes(nextLikes);
      setNopes(nextNopes);
      fetchNextPair(nextLikes, nextNopes);
      setPick(null);
      setLocked(false);
    }, 320);
  }

  function undoLast() {
    if (locked || history.length === 0) return;
    const last = history[history.length - 1];
    if (!last) return;

    completedRef.current = false;
    setHistory((prev) => prev.slice(0, -1));
    setLikes(last.likes);
    setNopes(last.nopes);
    setCurrentPair({ spotA: last.spotA, spotB: last.spotB });
    setRoundIndex(last.likes.length);
    setPick(null);
    setLocked(false);
    playHint();
  }

  if (loading && !currentPair) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-[14px] text-[#64748b]">診断の軸となるスポットを読み込んでいます…</p>
      </div>
    );
  }

  const totalRounds = 10;
  const progress = ((roundIndex) / totalRounds) * 100;
  const canUndo = history.length > 0 && !locked;

  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="flex flex-col">
        <div className="flex flex-col gap-3 px-4 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-extrabold text-transparent">
                tabipla
              </p>
              {refine && (
                <span className="rounded-full bg-[#1e293b] px-2 py-[2px] text-[11px] font-bold text-white">
                  深掘り中
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[13px] text-[#64748b]">
                {Math.min(roundIndex + 1, totalRounds)} / {totalRounds}
              </p>
              <button
                type="button"
                onClick={undoLast}
                disabled={!canUndo}
                className="flex items-center gap-1 rounded-full border border-[#cbd5e1] px-3 py-1 text-[12px] font-bold text-[#475569] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <UndoIcon className="size-3.5" />
                1つ戻す
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-[#cbd5e1] px-3 py-1 text-[12px] font-bold text-[#64748b] transition active:scale-95"
              >
                中止
              </button>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
            <div
              className="h-full rounded-full bg-(--brand) transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 px-4 pt-5">
          <p className="text-center text-[15px] font-bold text-[#64748b]">
            どちらが好みの観光地ですか？
          </p>

          {currentPair && (
            <div className="flex w-full max-w-[358px] flex-col items-stretch gap-3">
              <ComparisonCard
                spot={currentPair.spotA}
                position="top"
                disabled={locked || loading}
                selected={pick?.winnerId === currentPair.spotA.id}
                rejected={pick?.loserId === currentPair.spotB.id} // rejectedの代わりにハイライト制御
                wiggle={hintActive && !locked}
                onSelect={() => pickWinner(currentPair.spotA.id, currentPair.spotB.id)}
              />
              <div className="flex items-center justify-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-extrabold text-[#64748b]">
                  or
                </span>
              </div>
              <ComparisonCard
                spot={currentPair.spotB}
                position="bottom"
                disabled={locked || loading}
                selected={pick?.winnerId === currentPair.spotB.id}
                rejected={pick?.loserId === currentPair.spotA.id}
                wiggle={hintActive && !locked}
                onSelect={() => pickWinner(currentPair.spotB.id, currentPair.spotA.id)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { UndoIcon } from "../components/icons.tsx";
import { SpotImage } from "../components/SpotImage.tsx";
import type { SwipeSpot } from "../data/spots.ts";
import { spotPreviewText } from "../lib/spotMapper.ts";

const MAX_WINS_PER_SPOT = 3;

type SwipeMatch = {
  championId: string;
  challengerId: string;
  searchIndex: number;
};

type HistoryEntry = SwipeMatch & {
  wins: Record<string, number>;
  roundNumber: number;
};

type SwipeScreenProps = {
  spots: SwipeSpot[];
  /** 全ラウンド完了時。好みと判定したスポット ID と勝ち数を渡す。 */
  onComplete: (result: { likedIds: string[]; wins: Record<string, number> }) => void;
  /** 「好み診断を追加で行う」からの詳細設定ラウンドか。見出し表示が変わる。 */
  refine?: boolean;
  /** 中止ボタン押下時。比較をやめて前の画面へ戻る。 */
  onCancel: () => void;
};

function isRetired(spotId: string, wins: Record<string, number>): boolean {
  return (wins[spotId] ?? 0) >= MAX_WINS_PER_SPOT;
}

function createInitialMatch(spots: SwipeSpot[]): SwipeMatch | null {
  if (spots.length < 2) return null;
  const champion = spots[0];
  const challenger = spots[1];
  if (!champion || !challenger) return null;
  return { championId: champion.id, challengerId: challenger.id, searchIndex: 2 };
}

function findNextChallenger(
  spots: SwipeSpot[],
  championId: string,
  startIndex: number,
  wins: Record<string, number>,
): SwipeSpot | null {
  for (let index = startIndex; index < spots.length; index++) {
    const spot = spots[index];
    if (!spot || spot.id === championId || isRetired(spot.id, wins)) continue;
    return spot;
  }
  return null;
}

function findFreshPair(
  spots: SwipeSpot[],
  startIndex: number,
  wins: Record<string, number>,
): { top: SwipeSpot; bottom: SwipeSpot; nextIndex: number } | null {
  let first: SwipeSpot | null = null;
  for (let index = startIndex; index < spots.length; index++) {
    const spot = spots[index];
    if (!spot || isRetired(spot.id, wins)) continue;
    if (!first) {
      first = spot;
      continue;
    }
    return { top: first, bottom: spot, nextIndex: index + 1 };
  }
  return null;
}

/** 勝者決定後の次の対戦カードを決める。3勝したスポットは退場し、以降は別ペアを組む。 */
function advanceAfterPick(
  spots: SwipeSpot[],
  winnerId: string,
  wins: Record<string, number>,
  searchIndex: number,
): SwipeMatch | null {
  const winnerWins = wins[winnerId] ?? 0;

  if (winnerWins >= MAX_WINS_PER_SPOT) {
    const fresh = findFreshPair(spots, searchIndex, wins);
    if (!fresh) return null;
    return {
      championId: fresh.top.id,
      challengerId: fresh.bottom.id,
      searchIndex: fresh.nextIndex,
    };
  }

  const challenger = findNextChallenger(spots, winnerId, searchIndex, wins);
  if (challenger) {
    const challengerIndex = spots.findIndex((spot) => spot.id === challenger.id);
    return {
      championId: winnerId,
      challengerId: challenger.id,
      searchIndex: Math.max(searchIndex, challengerIndex + 1),
    };
  }

  const fresh = findFreshPair(spots, searchIndex, wins);
  if (!fresh) return null;
  return {
    championId: fresh.top.id,
    challengerId: fresh.bottom.id,
    searchIndex: fresh.nextIndex,
  };
}

/** 勝ち数上位（同数は元の並び順）から好み候補 ID を返す。 */
function computeLikedIds(spots: SwipeSpot[], wins: Record<string, number>): string[] {
  if (spots.length === 0) return [];
  const only = spots[0];
  if (spots.length === 1 && only) return [only.id];

  const likeCount = Math.max(1, Math.ceil(spots.length / 2));
  return [...spots]
    .sort((a, b) => {
      const diff = (wins[b.id] ?? 0) - (wins[a.id] ?? 0);
      if (diff !== 0) return diff;
      return spots.indexOf(a) - spots.indexOf(b);
    })
    .slice(0, likeCount)
    .map((s) => s.id);
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

/** フロー 3: 2つのスポットを比較して好みを伝える画面。 */
export function SwipeScreen({ spots, onComplete, refine = false, onCancel }: SwipeScreenProps) {
  const initialMatch = createInitialMatch(spots);
  const totalRounds = Math.max(1, spots.length - 1);
  const [roundNumber, setRoundNumber] = useState(1);
  const [championId, setChampionId] = useState(() => initialMatch?.championId ?? "");
  const [challengerId, setChallengerId] = useState(() => initialMatch?.challengerId ?? "");
  const [searchIndex, setSearchIndex] = useState(() => initialMatch?.searchIndex ?? 0);
  const [wins, setWins] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [locked, setLocked] = useState(false);
  const [pick, setPick] = useState<{ winnerId: string; loserId: string } | null>(null);
  const [hintActive, setHintActive] = useState(true);

  const likedRef = useRef<string[]>([]);
  const completedRef = useRef(false);
  const hintTimerRef = useRef<number | null>(null);

  const champion = spots.find((spot) => spot.id === championId);
  const challenger = spots.find((spot) => spot.id === challengerId);
  const currentTop = champion;
  const currentBottom = challenger;

  useEffect(() => {
    // リロード直後など deck 未復元の空配列では input へ飛ばさない。
    if (spots.length === 1 && !completedRef.current) {
      const only = spots[0];
      if (only) {
        completedRef.current = true;
        onComplete({ likedIds: [only.id], wins: { [only.id]: 1 } });
      }
    }
  }, [spots, onComplete]);

  const playHint = useCallback(() => {
    setHintActive(true);
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHintActive(false), 1300);
  }, []);

  useEffect(() => {
    playHint();
    return () => {
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    };
  }, [playHint]);

  function finish(winsSnapshot: Record<string, number>) {
    if (completedRef.current) return;
    completedRef.current = true;
    likedRef.current = computeLikedIds(spots, winsSnapshot);
    onComplete({ likedIds: likedRef.current, wins: winsSnapshot });
  }

  function pickWinner(winnerId: string, loserId: string) {
    if (locked || !currentTop || !currentBottom) return;
    setHintActive(false);
    setLocked(true);
    setPick({ winnerId, loserId });

    const nextWins = { ...wins, [winnerId]: (wins[winnerId] ?? 0) + 1 };
    const nextRoundNumber = roundNumber + 1;
    const isLastRound = roundNumber >= totalRounds;

    setHistory((prev) => [...prev, { championId, challengerId, searchIndex, wins, roundNumber }]);

    window.setTimeout(() => {
      if (isLastRound) {
        finish(nextWins);
        return;
      }

      const nextMatch = advanceAfterPick(spots, winnerId, nextWins, searchIndex);
      if (!nextMatch) {
        finish(nextWins);
        return;
      }

      setWins(nextWins);
      setChampionId(nextMatch.championId);
      setChallengerId(nextMatch.challengerId);
      setSearchIndex(nextMatch.searchIndex);
      setRoundNumber(nextRoundNumber);
      setPick(null);
      setLocked(false);
      playHint();
    }, 320);
  }

  function undoLast() {
    if (locked || history.length === 0) return;
    const last = history[history.length - 1];
    if (!last) return;

    completedRef.current = false;
    setHistory((prev) => prev.slice(0, -1));
    setChampionId(last.championId);
    setChallengerId(last.challengerId);
    setSearchIndex(last.searchIndex);
    setWins(last.wins);
    setRoundNumber(last.roundNumber);
    setPick(null);
    setLocked(false);
    playHint();
  }

  if (spots.length <= 1) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-[14px] text-[#64748b]">スポットを読み込んでいます…</p>
      </div>
    );
  }

  const progress = totalRounds > 0 ? (roundNumber / totalRounds) * 100 : 0;
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
                {Math.min(roundNumber, totalRounds)} / {totalRounds}
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

          {currentTop && currentBottom && (
            <div className="flex w-full max-w-[358px] flex-col items-stretch gap-3">
              <ComparisonCard
                spot={currentTop}
                position="top"
                disabled={locked}
                selected={pick?.winnerId === currentTop.id}
                rejected={pick?.loserId === currentTop.id}
                wiggle={hintActive && !locked}
                onSelect={() => pickWinner(currentTop.id, currentBottom.id)}
              />
              <div className="flex items-center justify-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-extrabold text-[#64748b]">
                  or
                </span>
              </div>
              <ComparisonCard
                spot={currentBottom}
                position="bottom"
                disabled={locked}
                selected={pick?.winnerId === currentBottom.id}
                rejected={pick?.loserId === currentBottom.id}
                wiggle={hintActive && !locked}
                onSelect={() => pickWinner(currentBottom.id, currentTop.id)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

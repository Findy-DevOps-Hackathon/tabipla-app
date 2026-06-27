import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import {
  CloseIcon,
  HeartFilledIcon,
  HeartIcon,
  UndoIcon,
  XCircleIcon,
} from "../components/icons.tsx";
import type { SwipeSpot } from "../data/spots.ts";
import { categoryBadgeClass } from "../lib/category.ts";

type SwipeScreenProps = {
  spots: SwipeSpot[];
  /** 全カードのスワイプ完了時。好きと判定したスポット ID を渡す。 */
  onComplete: (likedIds: string[]) => void;
  /** 「好みをより詳しく設定する」からの詳細設定ラウンドか。見出し表示が変わる。 */
  refine?: boolean;
  /** 中止ボタン押下時。スワイプをやめて前の画面へ戻る。 */
  onCancel: () => void;
};

type Decision = "like" | "nope";

type SwipeHistoryEntry = {
  decision: Decision;
  spotId: string;
};

/** スワイプ確定とみなす横移動量（px）。 */
const SWIPE_THRESHOLD = 110;

/** フロー 3: スポットカードをスワイプして好みを伝える画面（swipe-default/like/nope）。 */
export function SwipeScreen({ spots, onComplete, refine = false, onCancel }: SwipeScreenProps) {
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hintActive, setHintActive] = useState(true);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [locked, setLocked] = useState(false);

  const likedRef = useRef<string[]>([]);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockRef = useRef(false);

  const total = spots.length;
  const current = spots[index];
  const next = spots[index + 1];
  const afterNext = spots[index + 2];

  // ドラッグ方向のヒント（オーバーレイ表示用）。
  const intent: Decision | null = offset.x > 40 ? "like" : offset.x < -40 ? "nope" : null;
  const likeOpacity = Math.min(Math.max(offset.x / SWIPE_THRESHOLD, 0), 1);
  const nopeOpacity = Math.min(Math.max(-offset.x / SWIPE_THRESHOLD, 0), 1);
  const rotation = offset.x / 18;
  const showHint = hintActive && !dragging && !animate && offset.x === 0 && offset.y === 0;

  useEffect(() => {
    if (!hintActive) return;
    const timer = window.setTimeout(() => setHintActive(false), 900);
    return () => clearTimeout(timer);
  }, [hintActive]);

  function cardShadow(likeOp: number, nopeOp: number): string {
    const base = "0 12px 32px rgba(15,23,42,0.1)";
    if (likeOp > nopeOp && likeOp > 0) {
      return `0 0 56px rgba(16,185,129,${likeOp * 0.55}), 0 8px 28px rgba(16,185,129,${likeOp * 0.4}), ${base}`;
    }
    if (nopeOp > 0) {
      return `0 0 56px rgba(244,63,94,${nopeOp * 0.55}), 0 8px 28px rgba(244,63,94,${nopeOp * 0.4}), ${base}`;
    }
    return base;
  }

  function commit(decision: Decision) {
    if (locked || !current) return;
    setLocked(true);
    lockRef.current = true;

    setHistory((prev) => [...prev, { decision, spotId: current.id }]);
    if (decision === "like") likedRef.current = [...likedRef.current, current.id];

    setAnimate(true);
    setDragging(false);
    setOffset({ x: decision === "like" ? 600 : -600, y: 40 });

    window.setTimeout(() => {
      const isLast = index >= total - 1;
      if (isLast) {
        onComplete(likedRef.current);
        return;
      }
      setAnimate(false);
      setOffset({ x: 0, y: 0 });
      setIndex((prev) => prev + 1);
      lockRef.current = false;
      setLocked(false);
    }, 280);
  }

  function undoLast() {
    if (locked || history.length === 0) return;

    const last = history[history.length - 1];
    if (!last) return;
    setHistory((prev) => prev.slice(0, -1));
    if (last.decision === "like") {
      likedRef.current = likedRef.current.filter((id) => id !== last.spotId);
    }

    setHintActive(false);
    setAnimate(false);
    setDragging(false);
    setOffset({ x: 0, y: 0 });
    setIndex((prev) => prev - 1);
    lockRef.current = false;
    setLocked(false);
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (lockRef.current) return;
    setHintActive(false);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    setAnimate(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    setOffset({
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
    });
  }

  function handlePointerUp() {
    if (!startRef.current) return;
    startRef.current = null;
    setDragging(false);

    if (offset.x > SWIPE_THRESHOLD) {
      commit("like");
    } else if (offset.x < -SWIPE_THRESHOLD) {
      commit("nope");
    } else {
      setAnimate(true);
      setOffset({ x: 0, y: 0 });
    }
  }

  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  const canUndo = history.length > 0 && !locked;

  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="flex flex-col">
        <div className="flex flex-col gap-3 px-4 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[18px] font-extrabold text-transparent">
                tabipla
              </p>
              {refine && (
                <span className="rounded-full bg-[#1e293b] px-2 py-[2px] text-[11px] font-bold text-white">
                  好みを深掘り中
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[13px] text-[#64748b]">
                {Math.min(index + 1, total)} / {total}
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

        <div className="relative flex h-[520px] items-center justify-center">
          {afterNext && (
            <div className="absolute h-[442px] w-[330px] -rotate-4 rounded-3xl border border-[#e2e8f0] bg-white opacity-60" />
          )}
          {next && (
            <div className="absolute h-[461px] w-[344px] rotate-3 rounded-3xl border border-[#e2e8f0] bg-white opacity-80" />
          )}

          {current && (
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                transform: showHint
                  ? undefined
                  : `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
                transition: animate ? "transform 0.28s ease-out" : "none",
                boxShadow: cardShadow(likeOpacity, nopeOpacity),
              }}
              className={`absolute flex h-[480px] w-[358px] touch-none select-none flex-col rounded-3xl ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              } ${showHint ? "animate-swipe-hint" : ""}`}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white">
                <div className="relative flex h-[240px] items-start p-4">
                  <img
                    src={current.image}
                    alt={current.name}
                    draggable={false}
                    className="pointer-events-none absolute inset-0 size-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent from-70% to-black/25" />
                  <span
                    className={`relative rounded-md px-2 py-[3px] text-[12px] font-bold ${categoryBadgeClass(
                      current.category,
                    )}`}
                  >
                    {current.category}
                  </span>

                  <div
                    style={{ opacity: likeOpacity }}
                    className="pointer-events-none absolute left-4 top-9 flex -rotate-12 items-center gap-1.5 rounded-lg border-4 border-white bg-[#10b981] px-2 py-1"
                  >
                    <span className="text-[28px] font-black text-white">LIKE</span>
                    <HeartFilledIcon className="size-7 text-white" />
                  </div>
                  <div
                    style={{ opacity: nopeOpacity }}
                    className="pointer-events-none absolute right-4 top-16 flex rotate-12 items-center gap-1.5 rounded-lg border-4 border-white bg-[#f43f5e] px-2 py-1"
                  >
                    <span className="text-[28px] font-black text-white">NOPE</span>
                    <CloseIcon className="size-7 text-white" strokeWidth={3} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-4">
                  <p className="text-[12px] text-[#64748b]">
                    {current.prefecture} / {current.area}
                  </p>
                  <p className="text-[22px] font-extrabold text-[#0f172a]">{current.name}</p>
                  <p className="text-[14px] leading-normal text-[#475569]">{current.description}</p>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {current.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-[#e2e8f0] px-2 py-1 text-[12px] text-[#475569]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pb-14">
        <p className="text-[12px] text-[#94a3b8]">
          {refine
            ? "さらに好き・嫌いを振り分けて好みを絞り込みましょう"
            : "スワイプして好みを教えてください"}
        </p>
        <div className="flex items-center gap-20">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setHintActive(false);
                commit("nope");
              }}
              aria-label="興味なし"
              className={`flex items-center justify-center rounded-full bg-[#ffe4e6] text-[#f43f5e] transition active:scale-95 ${
                intent === "nope"
                  ? "size-[72px] shadow-[0_4px_10px_rgba(244,63,94,0.5)]"
                  : "size-16"
              }`}
            >
              <XCircleIcon className={intent === "nope" ? "size-8" : "size-7"} />
            </button>
            <p className="text-[11px] font-bold text-[#f43f5e]">興味なし</p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setHintActive(false);
                commit("like");
              }}
              aria-label="好き"
              className={`flex items-center justify-center rounded-full bg-[#d1fae5] text-[#059669] transition active:scale-95 ${
                intent === "like"
                  ? "size-[72px] shadow-[0_4px_10px_rgba(5,150,105,0.5)]"
                  : "size-16"
              }`}
            >
              <HeartIcon className={intent === "like" ? "size-8" : "size-7"} />
            </button>
            <p className="text-[11px] font-bold text-[#059669]">好き</p>
          </div>
        </div>
      </div>
    </div>
  );
}

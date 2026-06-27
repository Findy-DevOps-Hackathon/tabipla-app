import { useEffect, useRef, useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { ArrowRightIcon, ClockIcon, MapPinIcon } from "../components/icons.tsx";
import { RECOMMENDATIONS, type Recommendation } from "../data/spots.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";

/** ホーム中央カードを切り替える間隔（ミリ秒）。 */
const FEATURED_ROTATE_MS = 4000;

/** カードの入れ替えアニメーションの長さ（ミリ秒、CSS と一致させる）。 */
const FEATURED_SWAP_MS = 1100;

/** 相性スコアの高い順に並べたおすすめスポット（ホーム中央カードの表示候補）。 */
const FEATURED_SPOTS = [...RECOMMENDATIONS].sort((a, b) => b.match - a.match);

/**
 * ホーム中央のおすすめスポットカードの「見た目」1枚分。
 * 入れ替えアニメーション用に、入ってくる札と出ていく札の両方で使う。
 */
function FeaturedCard({
  spot,
  className,
  onClick,
}: {
  spot: Recommendation;
  className?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <img src={spot.image} alt={spot.name} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
        <p className="flex items-center gap-1 text-[10px] font-medium text-white/85">
          <MapPinIcon className="size-3" />
          {spot.prefecture} / {spot.area}
        </p>
        <p className="text-[17px] font-extrabold leading-tight text-white drop-shadow-sm">
          {spot.name}
        </p>
      </div>
    </>
  );

  const frameClass =
    "absolute inset-0 overflow-hidden rounded-[22px] bg-white/85 text-left shadow-[0_18px_48px_-16px_rgba(15,23,42,0.32)] backdrop-blur-xl";

  if (!onClick) {
    return (
      <div aria-hidden className={`${frameClass} ${className ?? ""}`}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${spot.name} を見る`}
      className={`group ${frameClass} transition active:scale-[0.99] ${className ?? ""}`}
    >
      {inner}
    </button>
  );
}

type WelcomeScreenProps = {
  /** 「好み診断から探す」タップ時。好み診断（スワイプ）フローへ進む。 */
  onStartDiagnosis: () => void;
  /** 「履歴を見る」タップ時。行った履歴画面へ進む。 */
  onViewHistory: () => void;
  /** 中央のおすすめカードをタップしたとき。スポット詳細を開く。 */
  onOpenSpot: (spot: Recommendation) => void;
};

/**
 * フロー 1: ホーム（frame-1-ask）。好み診断 / キーワード検索の 2 導線を提示する。
 *
 * 背景は格子状（グリッド）のデザイン。淡いグリッド線にブランドカラーの
 * グロー（ぼかし円）を重ね、中央から外周に向けてフェードさせる。
 */
export function WelcomeScreen({ onStartDiagnosis, onViewHistory, onOpenSpot }: WelcomeScreenProps) {
  // ホーム中央に置くおすすめ観光スポット。一定時間ごとに次の候補へ外枠ごと入れ替える。
  const [featuredIndex, setFeaturedIndex] = useState(0);
  // 入れ替え中に左へ送り出している前のカードのインデックス（null なら入れ替えなし）。
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (FEATURED_SPOTS.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = indexRef.current;
      const next = (current + 1) % FEATURED_SPOTS.length;
      indexRef.current = next;
      setLeavingIndex(current);
      setFeaturedIndex(next);
    }, FEATURED_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  // アニメーション終了後に前のカードを取り除く。
  useEffect(() => {
    if (leavingIndex === null) return;
    const timer = window.setTimeout(() => setLeavingIndex(null), FEATURED_SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [leavingIndex]);

  const featured = FEATURED_SPOTS[featuredIndex];
  const leaving =
    leavingIndex !== null && leavingIndex !== featuredIndex
      ? FEATURED_SPOTS[leavingIndex]
      : undefined;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-(--page)">
      <GridBackdrop />

      <div className="relative flex flex-1 flex-col gap-7 px-5 pb-9 pt-12">
        {/* ヒーロー */}
        <header className="flex flex-col items-center gap-4 text-center">
          <h1 className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[40px] font-black leading-none tracking-tight text-transparent">
            tabipla
          </h1>
          <p className="text-2xl leading-relaxed text-[#64748b]">
            あなたの好みに合った
            <br />
            観光スポットを紹介
          </p>
        </header>

        {/* おすすめ観光スポット（中央配置・一定時間ごとに外枠ごと入れ替え） */}
        {featured && (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="animate-float-soft relative aspect-3/4 w-full max-w-[220px]">
              {leaving && (
                <FeaturedCard
                  key={`leave-${leaving.id}`}
                  spot={leaving}
                  className="animate-card-leave"
                />
              )}
              <FeaturedCard
                key={featured.id}
                spot={featured}
                onClick={() => onOpenSpot(featured)}
                className="animate-card-enter"
              />
            </div>
          </div>
        )}

        {/* メイン CTA とサブ導線 */}
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onStartDiagnosis}
            className={`${PRIMARY_BUTTON} group px-5 py-[17px] text-[16px] tracking-[1.2px]`}
          >
            好み診断から探す
            <ArrowRightIcon className="size-5 transition-transform group-active:translate-x-0.5" />
          </button>

          <div className="pb-5">
            <button
              type="button"
              onClick={onViewHistory}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white/80 py-3 text-[13px] font-semibold text-[#475569] shadow-sm backdrop-blur transition active:scale-[0.98] active:bg-[#f1f5f9]"
            >
              <ClockIcon className="size-[15px]" />
              履歴を見る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

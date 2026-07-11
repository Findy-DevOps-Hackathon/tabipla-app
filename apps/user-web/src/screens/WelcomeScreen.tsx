import { useEffect, useRef, useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { ChevronRightIcon } from "../components/icons.tsx";
import { SpotImage } from "../components/SpotImage.tsx";
import { COMPARISON_EXPLORE_SPOTS } from "../data/comparisonSpots.ts";
import type { Recommendation } from "../data/spots.ts";
import { preloadImage } from "../lib/preloadImage.ts";
import { spotPreviewText } from "../lib/spotMapper.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";

/** 好み診断の比較カードと同じ幅・画像高さ。 */
const FEATURED_CARD_MAX_W = "max-w-[300px]";
const FEATURED_CARD_IMAGE_H = "h-[230px]";

/** ホーム中央カードを切り替える間隔（ミリ秒）。 */
const FEATURED_ROTATE_MS = 3000;

/** カードの入れ替えアニメーションの長さ（ミリ秒、CSS と一致させる）。 */
const FEATURED_SWAP_MS = 1600;

/**
 * ホーム中央のおすすめスポットカードの「見た目」1枚分。
 * 入れ替えアニメーション用に、入ってくる札と出ていく札の両方で使う。
 */
function FeaturedCard({
  spot,
  className,
  onClick,
  priority = false,
  lazy = false,
}: {
  spot: Recommendation;
  className?: string;
  onClick?: () => void;
  priority?: boolean;
  lazy?: boolean;
}) {
  const inner = (
    <div className={`relative ${FEATURED_CARD_IMAGE_H} w-full`}>
      <SpotImage
        src={spot.image}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full object-cover"
        priority={priority}
        lazy={lazy}
      />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/10 from-30% to-black/80" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-4">
        <p className="text-[15px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
          {spot.name}
        </p>
        <p className="text-[13px] leading-relaxed font-medium text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
          {spotPreviewText(spot)}
        </p>
      </div>
    </div>
  );

  const frameClass =
    "flex w-full touch-manipulation flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_12px_32px_rgba(15,23,42,0.1)]";

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
      className={`group transition active:scale-[0.99] ${frameClass} ${className ?? ""}`}
    >
      {inner}
    </button>
  );
}

type WelcomeScreenProps = {
  /** 「好み診断から探す」タップ時。好み診断（スワイプ）フローへ進む。 */
  onStartDiagnosis: () => void;
  /** 中央のおすすめカードをタップしたとき。スポット詳細を開く。 */
  onOpenSpot: (spot: Recommendation) => void;
  /** ホーム中央カード用スポット（旅先選択とは独立）。 */
  featuredSpots?: Recommendation[];
};

/**
 * フロー 1: ホーム（frame-1-ask）。好み診断 / キーワード検索の 2 導線を提示する。
 *
 * 背景は格子状（グリッド）のデザイン。淡いグリッド線にブランドカラーの
 * グロー（ぼかし円）を重ね、中央から外周に向けてフェードさせる。
 */
export function WelcomeScreen({
  onStartDiagnosis,
  onOpenSpot,
  featuredSpots = COMPARISON_EXPLORE_SPOTS,
}: WelcomeScreenProps) {
  const featuredSpotsList = featuredSpots.length > 0 ? featuredSpots : COMPARISON_EXPLORE_SPOTS;
  // ホーム中央に置くおすすめ観光スポット。一定時間ごとに次の候補へ外枠ごと入れ替える。
  const [featuredIndex, setFeaturedIndex] = useState(0);
  // 入れ替え中に左へ送り出している前のカードのインデックス（null なら入れ替えなし）。
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (featuredSpotsList.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = indexRef.current;
      const next = (current + 1) % featuredSpotsList.length;
      indexRef.current = next;
      setLeavingIndex(current);
      setFeaturedIndex(next);
    }, FEATURED_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [featuredSpotsList.length]);

  // アニメーション終了後に前のカードを取り除く。
  useEffect(() => {
    if (leavingIndex === null) return;
    const timer = window.setTimeout(() => setLeavingIndex(null), FEATURED_SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [leavingIndex]);

  const featured = featuredSpotsList[featuredIndex];
  const leaving =
    leavingIndex !== null && leavingIndex !== featuredIndex
      ? featuredSpotsList[leavingIndex]
      : undefined;

  useEffect(() => {
    if (!featured?.image) return;
    preloadImage(featured.image);
    if (featuredSpotsList.length <= 1) return;
    const next = featuredSpotsList[(featuredIndex + 1) % featuredSpotsList.length];
    if (next?.image) preloadImage(next.image);
  }, [featured?.image, featuredIndex, featuredSpotsList]);

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
            旅先であなたに合う
            <br />
            観光スポットが見つかる
          </p>
        </header>

        {/* おすすめ観光スポット（中央配置・一定時間ごとに外枠ごと入れ替え） */}
        {featured && (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div
              className={`animate-float-soft relative ${FEATURED_CARD_IMAGE_H} w-full ${FEATURED_CARD_MAX_W}`}
            >
              {leaving && (
                <FeaturedCard
                  key={`leave-${leaving.id}`}
                  spot={leaving}
                  className="absolute inset-0 animate-card-leave"
                  lazy
                />
              )}
              <FeaturedCard
                key={featured.id}
                spot={featured}
                onClick={() => onOpenSpot(featured)}
                className="absolute inset-0 animate-card-enter"
                priority
              />
            </div>
          </div>
        )}

        {/* メイン CTA とサブ導線 */}
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onStartDiagnosis}
            className={`${PRIMARY_BUTTON} h-16 max-w-[350px] mx-auto leading-none tracking-wider flex w-full items-center justify-center gap-1.5 px-5 my-5 text-[16px]`}
          >
            <div>好み診断から始める</div>
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

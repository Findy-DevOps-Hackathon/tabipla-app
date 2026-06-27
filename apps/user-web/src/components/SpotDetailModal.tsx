import type { Recommendation } from "../data/spots.ts";
import { categoryBadgeClass } from "../lib/category.ts";
import { useLockBodyScroll } from "../lib/useLockBodyScroll.ts";
import { CheckIcon, ChevronLeftIcon, MapPinIcon, SparklesIcon } from "./icons.tsx";

type SpotDetailModalProps = {
  recommendation: Recommendation;
  /** このスポットが「行った」済みか。 */
  visited: boolean;
  /** 閉じる（戻る）操作。 */
  onClose: () => void;
  /** 「クーポンを使う」タップ時。 */
  onUseCoupon: (recommendation: Recommendation) => void;
  /** 「行った」トグル時。 */
  onToggleVisited: (recommendation: Recommendation) => void;
};

/** おすすめ候補をタップしたときに表示するスポット詳細（フルスクリーン）。 */
export function SpotDetailModal({
  recommendation: rec,
  visited,
  onClose,
  onUseCoupon,
  onToggleVisited,
}: SpotDetailModalProps) {
  useLockBodyScroll();

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${rec.prefecture}${rec.area} ${rec.name}`,
  )}`;

  return (
    <div className="fixed inset-0 z-30 flex justify-center">
      <div className="flex h-full w-full max-w-[500px] flex-col overflow-hidden bg-white">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div className="relative aspect-16/11 w-full shrink-0">
            <img
              src={rec.image}
              alt={rec.name}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-black/20" />

            <button
              type="button"
              onClick={onClose}
              aria-label="戻る"
              className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-[#0f172a] shadow-sm transition active:scale-95"
            >
              <ChevronLeftIcon className="size-5" />
            </button>

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4">
              <span
                className={`w-fit rounded-md px-2 py-[3px] text-[12px] font-bold ${categoryBadgeClass(
                  rec.category,
                )}`}
              >
                {rec.category}
              </span>
              <p className="text-[12px] font-medium text-white/85">
                {rec.prefecture} / {rec.area}
              </p>
              <p className="text-[24px] font-extrabold leading-tight text-white drop-shadow-sm">
                {rec.name}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <section className="flex flex-col gap-1.5">
              <p className="text-[13px] font-bold text-[#0f172a]">スポット紹介</p>
              <p className="text-[14px] leading-[1.6] text-[#475569]">{rec.description}</p>
            </section>

            <section className="flex items-start gap-2 rounded-xl bg-(--ai-bg) px-3 py-2.5">
              <SparklesIcon className="mt-0.5 size-4 shrink-0 text-(--ai-fg)" />
              <div className="flex flex-col gap-0.5">
                <p className="text-[12px] font-bold text-(--ai-fg)">おすすめ理由</p>
                <p className="text-[13px] leading-normal text-(--ai-fg)">{rec.reason}</p>
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-[13px] font-bold text-[#0f172a]">タグ</p>
              <div className="flex flex-wrap gap-1.5">
                {rec.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[#e2e8f0] px-2 py-1 text-[12px] text-[#475569]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </section>

            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-2">
                <MapPinIcon className="size-4 shrink-0 text-(--brand)" />
                <span className="flex flex-col">
                  <span className="text-[13px] font-bold text-[#0f172a]">Googleマップで開く</span>
                  <span className="text-[11px] text-[#94a3b8]">
                    {rec.prefecture}
                    {rec.area}
                  </span>
                </span>
              </span>
              <span className="text-[11px] font-medium text-(--brand)">地図を見る</span>
            </a>

            {rec.coupon && (
              <button
                type="button"
                onClick={() => onUseCoupon(rec)}
                className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-3.5 text-left transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: rec.memberOnly ? "var(--member)" : "var(--brand)" }}
                  >
                    {rec.memberOnly ? "会員限定クーポン" : "だれでもクーポン"}
                  </span>
                  {!rec.memberOnly && (
                    <span className="text-[11px] font-medium text-(--brand)">登録不要で使える</span>
                  )}
                </div>
                <p className="text-[14px] font-bold leading-[1.4] text-[#0f172a]">{rec.coupon}</p>
                <span className="text-[11px] text-[#94a3b8]">タップしてクーポンを開く</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#e2e8f0] bg-white px-4 pb-6 pt-4">
          {rec.coupon && (
            <button
              type="button"
              onClick={() => onUseCoupon(rec)}
              style={{ backgroundColor: rec.memberOnly ? "var(--member)" : "var(--brand)" }}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-bold text-white transition active:scale-[0.99]"
            >
              クーポンを使う
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleVisited(rec)}
            aria-pressed={visited}
            className={`flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-bold transition active:scale-[0.99] ${
              rec.coupon ? "" : "flex-1"
            } ${
              visited
                ? "bg-[#059669] text-white"
                : "border border-[#cbd5e1] bg-white text-[#475569]"
            }`}
          >
            <CheckIcon className="size-4" />
            {visited ? "行った" : "行った？"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { couponCodeFor, type Recommendation } from "../data/spots.ts";
import { isCouponUsed, markCouponUsed } from "../lib/usedCoupons.ts";
import { useLockBodyScroll } from "../lib/useLockBodyScroll.ts";
import { markVisited } from "../lib/visited.ts";
import { CheckIcon } from "./icons.tsx";

type CouponModalProps = {
  recommendation: Recommendation;
  /** ログイン中ユーザーの表示名。未ログイン（非会員）は null。 */
  userName: string | null;
  /** 訪問履歴を保存する対象ユーザーの ID。 */
  userId: string;
  onClose: () => void;
  /** クーポン利用が確定し、履歴に追加されたとき。 */
  onUsed?: (recommendation: Recommendation) => void;
};

/** クーポン（会員限定／非会員も利用可）を表示するモーダル。 */
export function CouponModal({
  recommendation,
  userName,
  userId,
  onClose,
  onUsed,
}: CouponModalProps) {
  useLockBodyScroll();

  const code = couponCodeFor(recommendation.id);
  const memberOnly = recommendation.memberOnly;
  // 会員限定は紫（--member）、非会員も使えるクーポンはブランドティール（--brand）で色分けする。
  const accent = memberOnly ? "var(--member)" : "var(--brand)";
  // 会員限定クーポンは 1 回限り。過去に利用済みなら最初から「利用済み」表示にする。
  const [alreadyUsed] = useState(() => memberOnly && isCouponUsed(userId, recommendation.id));
  // 店員さんが「使う」を押したら利用済みに切り替える。
  const [used, setUsed] = useState(false);

  const handleUse = () => {
    // 履歴の保存にはログインが必要。会員（userName あり）のときだけ履歴に追加する。
    // 「だれでもクーポン」を未ログインで使う場合はクーポン利用のみ行い、履歴は残さない。
    if (userName) {
      markVisited(userId, {
        id: recommendation.id,
        name: recommendation.name,
        prefecture: recommendation.prefecture,
        area: recommendation.area,
        category: recommendation.category,
      });
    }
    // 会員限定クーポンは 1 回のみ利用可能なため、利用済みとして記録する。
    if (memberOnly) {
      markCouponUsed(userId, recommendation.id);
    }
    setUsed(true);
    onUsed?.(recommendation);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6">
      <div className="flex w-full max-w-[330px] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_rgba(15,23,42,0.3)]">
        <div
          className="flex flex-col items-center gap-1 px-5 py-5 text-center"
          style={{ backgroundColor: accent }}
        >
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white">
            {memberOnly ? "会員限定クーポン" : "だれでもクーポン"}
          </span>
          <p className="mt-1 text-[13px] text-white/80">{recommendation.name}</p>
        </div>

        <div className="flex flex-col items-center gap-4 px-5 py-6">
          <p className="text-center text-[18px] font-extrabold leading-[1.4] text-[#0f172a]">
            {recommendation.coupon}
          </p>

          <div className="w-full rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-center">
            <p className="text-[11px] text-[#64748b]">クーポンコード</p>
            {used ? (
              <p className="mt-0.5 text-[20px] font-black tracking-widest text-[#0f172a] tabular-nums">
                {code}
              </p>
            ) : (
              <>
                <p className="mt-0.5 select-none text-[20px] font-black tracking-widest text-[#cbd5e1] tabular-nums">
                  {"•".repeat(code.length)}
                </p>
                <p className="mt-0.5 text-[11px] text-[#94a3b8]">「使う」を押すと表示されます</p>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            {memberOnly && userName && (
              <p className="text-[12px] text-[#475569]">
                <span className="font-bold text-[#0f172a]">{userName}</span> さん専用
              </p>
            )}
          </div>

          {used ? (
            <>
              <div className="flex w-full flex-col items-center gap-1 rounded-2xl bg-[#ecfdf5] px-4 py-4 text-center">
                <CheckIcon className="size-6 text-[#047857]" />
                <p className="text-[15px] font-bold text-[#047857]">クーポンを利用しました</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 flex h-12 w-full items-center justify-center rounded-full bg-[#0f172a] text-[15px] font-semibold text-white transition active:scale-[0.99]"
              >
                閉じる
              </button>
            </>
          ) : alreadyUsed ? (
            <>
              <div className="flex w-full flex-col items-center gap-1 rounded-2xl bg-[#f1f5f9] px-4 py-4 text-center">
                <p className="text-[15px] font-bold text-[#475569]">このクーポンは利用済みです</p>
                <p className="text-[11px] text-[#94a3b8]">
                  会員限定クーポンは 1 回のみ利用できます
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 flex h-12 w-full items-center justify-center rounded-full bg-[#0f172a] text-[15px] font-semibold text-white transition active:scale-[0.99]"
              >
                閉じる
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-[11px] leading-normal text-[#94a3b8]">
                店舗・施設の受付でこの画面を提示してください。
              </p>

              <button
                type="button"
                onClick={handleUse}
                style={{ backgroundColor: accent }}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full text-[15px] font-bold text-white transition active:scale-[0.99]"
              >
                クーポンを使う（店員用）
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] text-[#94a3b8] transition active:opacity-60"
              >
                閉じる
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 利用済みクーポンをクライアントサイド（localStorage）で管理する。
 *
 * 会員限定クーポンは「1 回のみ利用可能」のため、利用したクーポン ID を会員ごとに記録し、
 * 2 回目以降の利用を防ぐ。visited.ts と同様に、将来的には backend-api 側へ移す想定。
 */

const USED_COUPONS_KEY = "tabipla-used-coupons";

/** localStorage 上の保存形（ユーザー ID → 利用済みクーポン ID 配列）。 */
type UsedCouponStore = Record<string, string[]>;

function readStore(): UsedCouponStore {
  try {
    const raw = localStorage.getItem(USED_COUPONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UsedCouponStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: UsedCouponStore): void {
  try {
    localStorage.setItem(USED_COUPONS_KEY, JSON.stringify(store));
  } catch {
    // localStorage 不可環境では記録を諦める（致命的ではない）。
  }
}

/** 指定クーポンが利用済みかどうか。 */
export function isCouponUsed(userId: string, couponId: string): boolean {
  return (readStore()[userId] ?? []).includes(couponId);
}

/** クーポンを利用済みとして記録する（重複は無視）。 */
export function markCouponUsed(userId: string, couponId: string): void {
  const store = readStore();
  const ids = store[userId] ?? [];
  if (ids.includes(couponId)) return;
  store[userId] = [...ids, couponId];
  writeStore(store);
}

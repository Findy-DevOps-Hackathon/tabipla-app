import { AlertTriangle, RefreshCw, Ticket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createCoupon, deleteCoupon, listCoupons, listSpots } from "../api.ts";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Input } from "../components/ui/Input.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import { formatDateTime } from "../lib/format.ts";
import { getFixedPrefecture } from "../master/index.ts";
import type { Coupon, Spot } from "../types.ts";

type Status = "loading" | "success" | "empty" | "error";

/** スポット / クーポン名 / 割引 / 備考 / 作成日 / 操作 */
const GRID = "grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_minmax(0,2fr)_8rem_4rem]";

export default function CouponsPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // 作成フォーム
  const [formOpen, setFormOpen] = useState(false);
  const [spotId, setSpotId] = useState("");
  const [title, setTitle] = useState("");
  const [discount, setDiscount] = useState("10");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 削除
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const spotName = useMemo(() => {
    const map = new Map(spots.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [spots]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [couponList, spotRes] = await Promise.all([
        listCoupons(),
        listSpots({ prefecture: getFixedPrefecture(), limit: 1000 }),
      ]);
      setCoupons(couponList);
      setSpots(spotRes.spots);
      setStatus(couponList.length === 0 ? "empty" : "success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = () => {
    setSpotId(spots[0]?.id ?? "");
    setTitle("");
    setDiscount("10");
    setDescription("");
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    const pct = Number(discount);
    if (!spotId) {
      setFormError("対象スポットを選択してください");
      return;
    }
    if (!title.trim()) {
      setFormError("クーポン名を入力してください");
      return;
    }
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      setFormError("割引率は 1〜100 の整数で入力してください");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createCoupon({
        spotId,
        title: title.trim(),
        discountPercent: pct,
        description: description.trim() || undefined,
      });
      setToast("クーポンを作成しました");
      setFormOpen(false);
      void load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCoupon(deleteTarget.id);
      setToast("クーポンを削除しました");
      setDeleteTarget(null);
      void load();
    } catch {
      setToast("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminShell title="クーポン">
      <div className="border-b border-[#e2e8f0] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[#64748b]">
            スポットに紐づくクーポン（5〜10%OFF など）を管理します。観光者は何度でも利用できます。
          </p>
          <Button onClick={openForm} disabled={spots.length === 0}>
            + 新規登録
          </Button>
        </div>
      </div>

      <div className="p-6">
        {status === "loading" && (
          <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`grid ${GRID} gap-5 border-b border-[#e2e8f0] px-5 py-5 last:border-0`}
              >
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="h-4 w-full animate-pulse rounded bg-[#e2e8f0]" />
                ))}
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center rounded-xl border border-[#e2e8f0] bg-white px-6 py-20 text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-[#fef2f2]">
              <AlertTriangle className="size-8 text-[#dc2626]" />
            </div>
            <h2 className="text-lg font-bold text-[#0f172a]">データを読み込めませんでした</h2>
            <Button className="mt-6" variant="secondary" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              再読み込み
            </Button>
          </div>
        )}

        {status === "empty" && (
          <div className="flex flex-col items-center rounded-xl border border-[#e2e8f0] bg-white px-6 py-20 text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-[#f8fafc]">
              <Ticket className="size-8 text-[#94a3b8]" />
            </div>
            <h2 className="text-lg font-bold text-[#0f172a]">クーポンはまだありません</h2>
            <p className="mt-2 max-w-md text-sm text-[#64748b]">
              {spots.length === 0
                ? "先にスポットを登録すると、クーポンを作成できます。"
                : "「新規登録」からスポットにクーポンを追加してください。"}
            </p>
            {spots.length > 0 && (
              <Button className="mt-6" onClick={openForm}>
                + 新規登録
              </Button>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
            <div
              className={`grid ${GRID} items-center gap-5 border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-3 text-[13px] font-bold text-[#475569]`}
            >
              <span>スポット</span>
              <span>クーポン名</span>
              <span className="text-center">割引</span>
              <span>条件・備考</span>
              <span>作成日</span>
              <span className="text-right">操作</span>
            </div>

            {coupons.map((coupon, idx) => (
              <div
                key={coupon.id}
                className={`grid ${GRID} items-center gap-5 border-b border-[#e2e8f0] px-5 py-4 last:border-0 ${
                  idx % 2 === 1 ? "bg-[#f8fafc]" : "bg-white"
                }`}
              >
                <span className="truncate text-sm font-medium text-[#0f172a]">
                  {spotName(coupon.spotId)}
                </span>
                <span className="truncate text-sm">🎟 {coupon.title}</span>
                <span className="text-center">
                  <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                    {coupon.discountPercent}% OFF
                  </span>
                </span>
                <span className="truncate text-sm text-[#475569]">{coupon.description ?? "—"}</span>
                <span className="text-[13px] text-[#475569]">
                  {formatDateTime(coupon.createdAt)}
                </span>
                <div className="text-right">
                  <button
                    type="button"
                    aria-label="削除"
                    className="cursor-pointer text-[#dc2626] hover:text-[#b91c1c]"
                    onClick={() => setDeleteTarget(coupon)}
                  >
                    <Trash2 className="ml-auto size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={formOpen} title="クーポンを作成" onClose={() => !saving && setFormOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="coupon-spot" className="text-sm font-medium text-[#0f172a]">
              対象スポット
            </label>
            <select
              id="coupon-spot"
              value={spotId}
              onChange={(e) => setSpotId(e.target.value)}
              className="h-11 cursor-pointer rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30"
            >
              {spots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
              ))}
            </select>
          </div>
          <Input label="クーポン名" value={title} onChange={setTitle} placeholder="例: 入園料10%OFF" />
          <Input
            label="割引率（%）"
            value={discount}
            onChange={setDiscount}
            type="number"
            placeholder="10"
          />
          <Input
            label="条件・備考（任意）"
            value={description}
            onChange={setDescription}
            placeholder="例: 1グループ1回まで"
          />
          {formError && <p className="text-xs text-[#dc2626]">{formError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="secondary" disabled={saving} onClick={() => setFormOpen(false)}>
              キャンセル
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? "作成中…" : "作成する"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="クーポンを削除しますか？"
        onClose={() => !deleting && setDeleteTarget(null)}
      >
        <p className="text-sm text-[#475569]">
          「{deleteTarget?.title}」を削除すると、旅行者向けアプリからも表示されなくなります。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>
            キャンセル
          </Button>
          <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
            {deleting ? "削除中…" : "削除する"}
          </Button>
        </div>
      </Modal>

      {toast && <Toast message={toast} variant={toast.includes("失敗") ? "error" : "success"} />}
    </AdminShell>
  );
}

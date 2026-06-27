import { AlertTriangle, RefreshCw, Search, ShoppingBag, Store, Trash2, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createRecommendation,
  deleteRecommendation,
  listRecommendations,
  listSpots,
  lookupPlaceByName,
} from "../api.ts";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Input, Textarea } from "../components/ui/Input.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import { formatDateTime } from "../lib/format.ts";
import { getFixedPrefecture } from "../master/index.ts";
import { RECOMMENDATION_TYPES, type Recommendation, type RecommendationType, type Spot } from "../types.ts";

type Status = "loading" | "success" | "empty" | "error";

/** スポット / 種別 / 店名 / 住所 / コメント / 作成日 / 操作 */
const GRID = "grid-cols-[minmax(0,1.5fr)_6rem_minmax(0,1.5fr)_minmax(0,2fr)_8rem_4rem]";

/** Google のカテゴリから種別を推定（グルメ → お食事処）。 */
function guessType(category?: string | string[]): RecommendationType | null {
  const cats = Array.isArray(category) ? category : category ? [category] : [];
  if (cats.includes("グルメ")) return "お食事処";
  return null;
}

export default function RecommendationsPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<Recommendation[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // 作成フォーム
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<RecommendationType>("お食事処");
  const [spotId, setSpotId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [url, setUrl] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 削除
  const [deleteTarget, setDeleteTarget] = useState<Recommendation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const spotName = useMemo(() => {
    const map = new Map(spots.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [spots]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [recList, spotRes] = await Promise.all([
        listRecommendations(),
        listSpots({ prefecture: getFixedPrefecture(), limit: 1000 }),
      ]);
      setItems(recList);
      setSpots(spotRes.spots);
      setStatus(recList.length === 0 ? "empty" : "success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = () => {
    setType("お食事処");
    setSpotId(spots[0]?.id ?? "");
    setSearchName("");
    setName("");
    setAddress("");
    setLat(null);
    setLon(null);
    setComment("");
    setUrl("");
    setLookupHint(null);
    setFormError(null);
    setFormOpen(true);
  };

  // 店名検索 → name/address/緯度経度を自動入力。
  const runLookup = async () => {
    const query = searchName.trim();
    if (!query) return;
    setLooking(true);
    setLookupHint(null);
    setFormError(null);
    try {
      const place = await lookupPlaceByName(query, { prefecture: getFixedPrefecture() });
      if (!place) {
        setLookupHint("該当する店舗が見つかりませんでした。手入力でも登録できます。");
        if (!name) setName(query);
        return;
      }
      setName(place.name ?? query);
      setAddress(place.address ?? "");
      setLat(place.lat);
      setLon(place.lon);
      const guessed = guessType(place.category);
      if (guessed) setType(guessed);
      setLookupHint(`✓「${place.name ?? query}」を取得しました${place.address ? `（${place.address}）` : ""}`);
    } catch {
      setLookupHint("検索に失敗しました。手入力でも登録できます。");
      if (!name) setName(query);
    } finally {
      setLooking(false);
    }
  };

  const submit = async () => {
    if (!spotId) {
      setFormError("紐づけるスポットを選択してください");
      return;
    }
    if (!name.trim()) {
      setFormError("店名を入力（または検索で取得）してください");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createRecommendation({
        spotId,
        type,
        name: name.trim(),
        address: address.trim() || undefined,
        lat: lat ?? undefined,
        lon: lon ?? undefined,
        comment: comment.trim() || undefined,
        url: url.trim() || undefined,
      });
      setToast("おすすめ店を登録しました");
      setFormOpen(false);
      void load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRecommendation(deleteTarget.id);
      setToast("おすすめ店を削除しました");
      setDeleteTarget(null);
      void load();
    } catch {
      setToast("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminShell title="おすすめ店">
      <div className="border-b border-[#e2e8f0] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[#64748b]">
            観光スポット近くの「お食事処」「お土産どころ」を紹介します。店名検索で住所・座標を自動入力できます。
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
              <Store className="size-8 text-[#94a3b8]" />
            </div>
            <h2 className="text-lg font-bold text-[#0f172a]">おすすめ店はまだありません</h2>
            <p className="mt-2 max-w-md text-sm text-[#64748b]">
              {spots.length === 0
                ? "先にスポットを登録すると、おすすめ店を紹介できます。"
                : "「新規登録」から店名を検索して、お食事処・お土産どころを追加してください。"}
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
              <span className="text-center">種別</span>
              <span>店名</span>
              <span>住所・コメント</span>
              <span>作成日</span>
              <span className="text-right">操作</span>
            </div>

            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`grid ${GRID} items-center gap-5 border-b border-[#e2e8f0] px-5 py-4 last:border-0 ${
                  idx % 2 === 1 ? "bg-[#f8fafc]" : "bg-white"
                }`}
              >
                <span className="truncate text-sm font-medium text-[#0f172a]">
                  {spotName(item.spotId)}
                </span>
                <span className="text-center">
                  <TypeBadge type={item.type} />
                </span>
                <span className="truncate text-sm">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#2563eb] hover:underline"
                    >
                      {item.name}
                    </a>
                  ) : (
                    item.name
                  )}
                </span>
                <span className="truncate text-sm text-[#475569]">
                  {item.comment || item.address || "—"}
                </span>
                <span className="text-[13px] text-[#475569]">{formatDateTime(item.createdAt)}</span>
                <div className="text-right">
                  <button
                    type="button"
                    aria-label="削除"
                    className="cursor-pointer text-[#dc2626] hover:text-[#b91c1c]"
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 className="ml-auto size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={formOpen} title="おすすめ店を登録" onClose={() => !saving && setFormOpen(false)}>
        <div className="flex flex-col gap-4">
          {/* 種別トグル */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#0f172a]">種別</span>
            <div className="flex gap-2">
              {RECOMMENDATION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                    type === t
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                      : "border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]"
                  }`}
                >
                  {t === "お食事処" ? (
                    <Utensils className="size-4" />
                  ) : (
                    <ShoppingBag className="size-4" />
                  )}
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 店名検索（自動入力） */}
          <div className="flex flex-col gap-2">
            <label htmlFor="reco-search" className="text-sm font-medium text-[#0f172a]">
              店名で検索（住所・座標を自動入力）
            </label>
            <div className="flex gap-2">
              <input
                id="reco-search"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runLookup();
                  }
                }}
                placeholder="例: 草笛 小諸"
                className="h-11 flex-1 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30"
              />
              <Button variant="secondary" disabled={looking} onClick={() => void runLookup()}>
                <Search className="mr-1.5 size-4" />
                {looking ? "検索中…" : "検索"}
              </Button>
            </div>
            {lookupHint && <p className="text-xs text-[#64748b]">{lookupHint}</p>}
          </div>

          <Input label="店名" value={name} onChange={setName} placeholder="店名（検索で自動入力／手入力可）" />

          <div className="flex flex-col gap-2">
            <label htmlFor="reco-spot" className="text-sm font-medium text-[#0f172a]">
              紐づけるスポット（この観光地の下に表示）
            </label>
            <select
              id="reco-spot"
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

          <Textarea
            label="おすすめコメント（任意）"
            value={comment}
            onChange={setComment}
            rows={2}
            placeholder="例: くるみそばが名物。観光ついでに立ち寄れます。"
          />
          <Input
            label="参考URL（任意）"
            value={url}
            onChange={setUrl}
            placeholder="食べログ・ホットペッパー等のURL"
          />

          {address && <p className="text-xs text-[#64748b]">住所: {address}</p>}
          {formError && <p className="text-xs text-[#dc2626]">{formError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="secondary" disabled={saving} onClick={() => setFormOpen(false)}>
              キャンセル
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? "登録中…" : "登録する"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="おすすめ店を削除しますか？"
        onClose={() => !deleting && setDeleteTarget(null)}
      >
        <p className="text-sm text-[#475569]">
          「{deleteTarget?.name}」を削除すると、旅行者向けアプリからも表示されなくなります。
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

function TypeBadge({ type }: { type: RecommendationType }) {
  const isFood = type === "お食事処";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
        isFood ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {isFood ? <Utensils className="size-3" /> : <ShoppingBag className="size-3" />}
      {type}
    </span>
  );
}

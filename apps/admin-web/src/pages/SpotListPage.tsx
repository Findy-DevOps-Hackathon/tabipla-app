import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  MoreVertical,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteSpot, listSpots } from "../api.ts";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import { normalizeCategories } from "../lib/categories.ts";
import { CSV_HEADER, formatDateTime, spotToCsvRow } from "../lib/format.ts";
import { getFixedPrefecture } from "../master/index.ts";
import { PAGE_SIZE, type Spot } from "../types.ts";

type Status = "loading" | "success" | "empty" | "error";

/** チェックボックス + スポット名 + カテゴリ + エリア + 更新日 + 同期 + 操作 */
const TABLE_GRID_COLS =
  "grid-cols-[16px_minmax(0,2.5fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_5rem_4rem]";

export default function SpotListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [spots, setSpots] = useState<Spot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const fixedPrefecture = getFixedPrefecture();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Spot | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await listSpots({
        q: q.trim() || undefined,
        prefecture: fixedPrefecture,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setSpots(res.spots);
      setTotal(res.total);
      setStatus(res.total === 0 ? "empty" : "success");
    } catch {
      setSpots([]);
      setTotal(0);
      setStatus("error");
    }
  }, [q, fixedPrefecture, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuId) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuId(null);
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handlePointerDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  const handleExport = async () => {
    if (selected.size === 0) return;
    try {
      const res = await listSpots({ limit: 1000, prefecture: fixedPrefecture });
      const exportSpots = res.spots.filter((spot) => selected.has(spot.id));
      if (exportSpots.length === 0) {
        setToast("選択したスポットが見つかりませんでした");
        return;
      }
      const rows = [CSV_HEADER, ...exportSpots.map(spotToCsvRow)];
      const blob = new Blob([`${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spots-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast("エクスポートに失敗しました");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSpot(deleteTarget.id);
      setToast("スポットを削除しました");
      setDeleteTarget(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      void load();
    } catch {
      setToast("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteSpot(id)));
      setToast(`${ids.length} 件のスポットを削除しました`);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      void load();
    } catch {
      setToast("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminShell title="スポット管理">
      <div className="border-b border-[#e2e8f0] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex h-10 w-full max-w-xs items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3">
            <Search className="size-4 text-[#94a3b8]" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="スポット名・住所で検索"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#94a3b8]"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {selected.size > 0 && (
              <Button
                variant="secondary"
                className="border border-red-400 text-red-500 hover:bg-red-50"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                削除（{selected.size}）
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={selected.size === 0}
              onClick={() => void handleExport()}
              className={
                selected.size === 0
                  ? "border border-gray-200 bg-gray-50 text-gray-400 disabled:opacity-100"
                  : "border border-green-500 text-green-500 hover:bg-green-50 disabled:opacity-100"
              }
            >
              <Download className="mr-2 size-4" />
              CSVダウンロード
            </Button>
            <Button
              variant="secondary"
              className="border border-blue-400 text-blue-500 hover:bg-blue-50"
              onClick={() => navigate("/spots/import")}
            >
              <Upload className="mr-2 size-4" />
              一括登録
            </Button>
            <Button onClick={() => navigate("/spots/new")}>+ 新規登録</Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {status === "loading" && (
          <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`grid ${TABLE_GRID_COLS} gap-5 border-b border-[#e2e8f0] px-5 py-5 last:border-0`}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="h-4 w-full animate-pulse rounded bg-[#e2e8f0]" />
                ))}
              </div>
            ))}
          </div>
        )}

        {status === "empty" && (
          <div className="flex flex-col items-center rounded-xl border border-[#e2e8f0] bg-white px-6 py-20 text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-[#f8fafc]">
              <MapPin className="size-8 text-[#94a3b8]" />
            </div>
            <h2 className="text-lg font-bold text-[#0f172a]">登録されたスポットはありません</h2>
            <p className="mt-2 max-w-md text-sm text-[#64748b]">
              まだスポットが登録されていません。サンプルデータを取り込むか、新規登録から始めてください。
            </p>
            <div className="mt-6 flex gap-3">
              <Button onClick={() => navigate("/spots/new")}>+ 新規登録</Button>
              <Button variant="secondary" onClick={() => navigate("/spots/import")}>
                <Upload className="mr-2 size-4" />
                CSV 一括取り込み
              </Button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center rounded-xl border border-[#e2e8f0] bg-white px-6 py-20 text-center">
            <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-[#fef2f2]">
              <AlertTriangle className="size-8 text-[#dc2626]" />
            </div>
            <h2 className="text-lg font-bold text-[#0f172a]">データを読み込めませんでした</h2>
            <p className="mt-2 text-sm text-[#64748b]">
              サーバーで問題が発生しました。時間をおいて再度お試しください。
            </p>
            <Button className="mt-6" variant="secondary" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              再読み込み
            </Button>
          </div>
        )}

        {status === "success" && (
          <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
            <div
              className={`grid ${TABLE_GRID_COLS} items-center gap-5 border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-3 text-[13px] font-bold text-[#475569]`}
            >
              <input
                type="checkbox"
                aria-label="全選択"
                checked={selected.size === spots.length && spots.length > 0}
                onChange={(e) => {
                  setSelected(e.target.checked ? new Set(spots.map((s) => s.id)) : new Set());
                }}
                className="size-4 rounded border-[#e2e8f0]"
              />
              <span>スポット名</span>
              <span>カテゴリ</span>
              <span>エリア</span>
              <span>更新日</span>
              <span className="text-center">同期</span>
              <span className="text-right">操作</span>
            </div>

            {spots.map((spot, idx) => (
              <div
                key={spot.id}
                className={`relative grid ${TABLE_GRID_COLS} items-center gap-5 border-b border-[#e2e8f0] px-5 py-4 last:border-0 ${
                  idx % 2 === 1 ? "bg-[#f8fafc]" : "bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(spot.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(spot.id);
                    else next.delete(spot.id);
                    setSelected(next);
                  }}
                  className="size-4 rounded border-[#e2e8f0]"
                />
                <Link
                  to={`/spots/${spot.id}/edit`}
                  className="cursor-pointer truncate text-sm font-medium text-[#2563eb] hover:underline"
                >
                  {spot.name}
                </Link>
                <span className="inline-flex flex-wrap gap-1">
                  {normalizeCategories(spot.category).map((cat) => (
                    <span
                      key={cat}
                      className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-0.5 text-xs font-medium text-[#475569]"
                    >
                      {cat}
                    </span>
                  ))}
                </span>
                <span className="truncate text-sm">{spot.area ?? "—"}</span>
                <span className="text-[13px] text-[#475569]">{formatDateTime(spot.updatedAt)}</span>
                <CheckCircle2 className="mx-auto size-4 text-[#10b981]" />
                <div className="relative text-right" ref={menuId === spot.id ? menuRef : undefined}>
                  <button
                    type="button"
                    className="cursor-pointer text-[#94a3b8]"
                    onClick={() => setMenuId(menuId === spot.id ? null : spot.id)}
                  >
                    <MoreVertical className="mx-auto size-4" />
                  </button>
                  {menuId === spot.id && (
                    <div className="absolute right-0 top-6 z-10 min-w-[120px] rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-[#f8fafc]"
                        onClick={() => {
                          setMenuId(null);
                          navigate(`/spots/${spot.id}/edit`);
                        }}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className="block w-full cursor-pointer px-4 py-2 text-left text-sm text-[#dc2626] hover:bg-[#fef2f2]"
                        onClick={() => {
                          setMenuId(null);
                          setDeleteTarget(spot);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between bg-[#f8fafc] px-5 py-5">
              <p className="text-sm text-[#475569]">
                {pageStart}–{pageEnd} / {total}件
              </p>
              <div className="flex gap-2">
                <PageBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </PageBtn>
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((n) => (
                  <PageBtn key={n} active={page === n} onClick={() => setPage(n)}>
                    {n}
                  </PageBtn>
                ))}
                <PageBtn disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="size-4" />
                </PageBtn>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!deleteTarget}
        title="スポットを削除しますか？"
        onClose={() => !deleting && setDeleteTarget(null)}
      >
        <p className="text-sm text-[#475569]">
          「{deleteTarget?.name}
          」を削除すると、旅行者向けアプリからも非表示になります。この操作は取り消せません。
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

      <Modal
        open={bulkDeleteOpen}
        title={`選択した ${selected.size} 件を削除しますか？`}
        onClose={() => !deleting && setBulkDeleteOpen(false)}
      >
        <p className="text-sm text-[#475569]">
          選択したスポットを削除すると、旅行者向けアプリからも非表示になります。この操作は取り消せません。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={deleting} onClick={() => setBulkDeleteOpen(false)}>
            キャンセル
          </Button>
          <Button variant="danger" disabled={deleting} onClick={() => void confirmBulkDelete()}>
            {deleting ? "削除中…" : "削除する"}
          </Button>
        </div>
      </Modal>

      {toast && <Toast message={toast} variant={toast.includes("失敗") ? "error" : "success"} />}
    </AdminShell>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 cursor-pointer items-center justify-center rounded-md text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-[#2563eb] font-bold text-white"
          : "border border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]"
      }`}
    >
      {children}
    </button>
  );
}

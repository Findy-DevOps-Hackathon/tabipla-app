import { Loader2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  bulkImportSpots,
  collectSpots,
  geocodeAddress,
  listSpots,
  lookupPlaceByName,
  type CollectedSpotPayload,
} from "../api.ts";
import { Button } from "../components/ui/Button.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import {
  type CollectedSpotDraft,
  type CollectDraft,
  useSpotAddDraft,
} from "../context/SpotAddDraftContext.tsx";
import { extractAreaFromAddress } from "../lib/address.ts";
import { getCategoryStyle, MAX_SPOT_CATEGORIES, normalizeCategories, SPOT_CATEGORIES, type SpotCategory } from "../lib/categories.ts";
import {
  MAX_SPOT_DESCRIPTION_LENGTH,
  MAX_SPOT_HIGHLIGHT_LENGTH,
  MAX_SPOT_HIGHLIGHT_COUNT,
  enforceHighlightsText,
  normalizeHighlights,
  parseHighlightsText,
  trimSpotDescription,
} from "../lib/format.ts";
import { MUNICIPALITY, type Prefecture } from "../master/index.ts";

type CollectedSpot = CollectedSpotDraft;

/** チェックボックス + 観光地名 + カテゴリ + 住所 + 紹介文 + おすすめポイント + 操作 */
const COLLECT_TABLE_GRID_COLS =
  "grid-cols-[16px_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_3rem]";

/** 表記ゆれを吸収した名前照合キー（agent側 normalizeSpotName と同じ規則）。 */
function nameKey(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
}

/** 指定エリアの登録済み観光地名を取得する（重複収集・二重登録の防止用）。 */
async function fetchExistingNames(municipality: string): Promise<string[]> {
  const res = await listSpots({ limit: 1000 });
  return res.spots.filter((s) => !s.area || s.area === municipality).map((s) => s.name);
}

/** 収集直後に Places lookup で住所・座標を補完する（個別登録と同じ API）。 */
async function enrichCollectedSpot(
  spot: CollectedSpotPayload,
  prefecture: Prefecture,
  municipality: string,
): Promise<CollectedSpot> {
  const { category, ...rest } = spot;
  const description = trimSpotDescription(spot.description);
  const baseCategories = normalizeCategories(category);
  const lookup = await lookupPlaceByName(spot.name, { prefecture, municipality });

  if (lookup) {
    const address = lookup.address?.trim() || spot.address;
    const area = address ? extractAreaFromAddress(address, prefecture) || spot.area : spot.area;
    return {
      ...rest,
      description,
      highlights: normalizeHighlights(spot.highlights ?? []),
      categories: normalizeCategories([
        ...baseCategories,
        ...(lookup.category
          ? Array.isArray(lookup.category)
            ? lookup.category
            : [lookup.category]
          : []),
      ]),
      address,
      area,
      selected: true,
      location: { lat: lookup.lat, lon: lookup.lon },
    };
  }

  const location =
    (await geocodeAddress(`${spot.name} ${prefecture}${spot.area || municipality}`)) ??
    (spot.address ? await geocodeAddress(spot.address) : null);

  return {
    ...rest,
    description,
    highlights: normalizeHighlights(spot.highlights ?? []),
    categories: baseCategories,
    selected: true,
    location: location ?? undefined,
  };
}

export default function CollectPage() {
  const navigate = useNavigate();
  const { collectDraft, setCollectDraft, resetCollectDraft } = useSpotAddDraft();
  const { selectedCategories, targetCount, step, spots, categoryFilter, result } = collectDraft;

  const patchCollect = (patch: Partial<CollectDraft>) => {
    setCollectDraft((prev) => ({ ...prev, ...patch }));
  };

  const setSpots = (value: CollectedSpot[] | ((prev: CollectedSpot[]) => CollectedSpot[])) => {
    setCollectDraft((prev) => ({
      ...prev,
      spots: typeof value === "function" ? value(prev.spots) : value,
    }));
  };

  // 担当エリアはログイン自治体に固定（都道府県・市区町村は選ばせない）。
  const prefecture = MUNICIPALITY.prefecture;
  const municipality = MUNICIPALITY.name;
  // インライン編集中の観光地（spots 配列のインデックス）。null なら非編集。
  const [editing, setEditing] = useState<number | null>(null);
  const [editingBackup, setEditingBackup] = useState<CollectedSpot | null>(null);
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedCount = spots.filter((s) => s.selected).length;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of spots) {
      for (const cat of normalizeCategories(s.categories)) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return [...counts.entries()];
  }, [spots]);

  // 絞り込み表示（spots 配列の元インデックス付き。編集・トグルは元配列を更新する）。
  const visibleSpots = useMemo(
    () =>
      spots
        .map((spot, index) => ({ spot, index }))
        .filter(({ spot }) => !categoryFilter || normalizeCategories(spot.categories).includes(categoryFilter)),
    [spots, categoryFilter],
  );

  const toggleAll = () => {
    const allSelected = visibleSpots.every(({ spot }) => spot.selected);
    const visible = new Set(visibleSpots.map(({ index }) => index));
    setSpots(spots.map((s, i) => (visible.has(i) ? { ...s, selected: !allSelected } : s)));
  };

  const toggleOne = (index: number) => {
    setSpots(spots.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s)));
  };

  /** 編集フォームからの部分更新（編集内容は即時に反映され、そのまま登録に使われる）。 */
  const updateSpot = (index: number, patch: Partial<CollectedSpot>) => {
    setSpots(spots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const startEditing = (index: number) => {
    const spot = spots[index];
    if (spot === undefined) return;
    setEditingBackup({ ...spot });
    setEditing(index);
  };

  const finishEditing = () => {
    setEditing(null);
    setEditingBackup(null);
  };

  const cancelEditing = () => {
    if (editing !== null && editingBackup) {
      setSpots(spots.map((s, i) => (i === editing ? editingBackup : s)));
    }
    finishEditing();
  };

  const abortCollectPreview = () => {
    resetCollectDraft();
    setEditing(null);
    setEditingBackup(null);
    setAbortConfirmOpen(false);
  };

  const toggleCategory = (category: SpotCategory) => {
    patchCollect({
      selectedCategories: selectedCategories.includes(category)
        ? selectedCategories.filter((c) => c !== category)
        : [...selectedCategories, category],
    });
  };

  const handleCollect = async () => {
    if (selectedCategories.length === 0) {
      setToast("カテゴリを1つ以上選択してください");
      return;
    }
    patchCollect({ step: "collecting" });
    try {
      const excludeNames = await fetchExistingNames(municipality);
      const collected = await collectSpots({
        municipality,
        prefecture,
        targetCount,
        categories: selectedCategories,
        excludeNames,
      });
      if (collected.length === 0) {
        setToast(
          excludeNames.length > 0
            ? "新しい観光地は見つかりませんでした（登録済みの観光地は除外されます）"
            : "選択したカテゴリに該当する観光地が見つかりませんでした。カテゴリや件数を変えてお試しください",
        );
        patchCollect({ step: "input" });
        return;
      }
      // 収集直後に Places lookup で住所・座標を補完する（登録時にそのまま使う）。
      const withLocation = await Promise.all(
        collected.map((s) => enrichCollectedSpot(s, prefecture, municipality)),
      );
      setSpots(withLocation);
      patchCollect({ categoryFilter: null, step: "preview" });
      setEditing(null);
      setEditingBackup(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "収集に失敗しました");
      patchCollect({ step: "input" });
    }
  };

  const handleRegister = async () => {
    const selected = spots.filter((s) => s.selected);
    if (selected.length === 0) {
      setToast("登録する観光地を選択してください");
      return;
    }
    if (selected.some((s) => normalizeCategories(s.categories).length === 0)) {
      setToast("カテゴリ未設定の観光地があります。編集して1件以上選択してください");
      return;
    }
    patchCollect({ step: "registering" });
    try {
      // 収集中に他の経路で登録された分も含め、直前の最新状態で二重登録を防ぐ
      const existingKeys = new Set((await fetchExistingNames(municipality)).map(nameKey));
      const newSpots = selected.filter((s) => !existingKeys.has(nameKey(s.name)));
      if (newSpots.length === 0) {
        setToast("選択した観光地はすべて登録済みです");
        patchCollect({ step: "preview" });
        return;
      }
      // 座標は収集時に付与済み（プレビューで確認・編集された値）をそのまま使う。
      const spotsToImport = newSpots.map((s) => ({
        id: crypto.randomUUID(),
        name: s.name,
        description: trimSpotDescription(s.description),
        ...(s.highlights.length ? { highlights: normalizeHighlights(s.highlights) } : {}),
        ...(normalizeCategories(s.categories).length
          ? { category: normalizeCategories(s.categories) }
          : {}),
        area: s.area,
        prefecture: s.prefecture,
        address: s.address,
        tags: s.tags,
        ...(s.location ? { location: s.location } : {}),
      }));
      const res = await bulkImportSpots(spotsToImport);
      patchCollect({ result: { ok: res.count }, step: "done" });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "登録に失敗しました");
      patchCollect({ step: "preview" });
    }
  };

  const toggleSpotCategory = (index: number, category: SpotCategory) => {
    const spot = spots[index];
    if (!spot) return;
    const current = normalizeCategories(spot.categories);
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : current.length >= MAX_SPOT_CATEGORIES
        ? current
        : [...current, category];
    updateSpot(index, { categories: normalizeCategories(next) });
  };

  const pageShell = "px-8";
  const cardShell = "flex flex-col gap-5";

  return (
    <>
      {step === "input" && (
        <div className={pageShell}>
          <div className={cardShell}>
            <div className="flex items-end gap-1">
              <div className="text-base font-semibold">
                自動で観光地情報を収集して、提案を行います
              </div>
              <div className="text-xs text-[#64748b]">※30秒〜2分程度かかります</div>
            </div>

            <div className="flex flex-col gap-7">
              <div>
                <p className="mb-3 text-sm font-medium text-[#0f172a]">
                  カテゴリ <span className="text-xs text-[#64748b]">（複数選択可）</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {SPOT_CATEGORIES.map((category) => {
                    const active = selectedCategories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] transition ${
                          active
                            ? "bg-[#2563eb] font-medium text-white"
                            : "bg-white text-[#475569] hover:bg-[#e2e8f0]"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-[#0f172a]">目標件数</p>
                <div className="flex flex-wrap gap-2">
                  {[10, 30, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patchCollect({ targetCount: n })}
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-sm transition ${
                        targetCount === n
                          ? "bg-[#2563eb] font-medium text-white"
                          : "bg-white text-[#475569] hover:bg-[#e2e8f0]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => navigate("/spots")}>
                キャンセル
              </Button>
              <Button
                disabled={selectedCategories.length === 0}
                onClick={() => void handleCollect()}
              >
                収集開始
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "collecting" && (
        <div className={pageShell}>
          <div className={`${cardShell} flex flex-col items-center py-20 text-center`}>
            <Loader2 className="size-10 animate-spin text-[#2563eb]" aria-hidden />
            <p className="mt-5 text-lg font-semibold text-[#0f172a]">観光地を収集しています…</p>
          </div>
        </div>
      )}

      {(step === "preview" || step === "registering") && (
        <div className={pageShell}>
          <div className={cardShell}>
            <p className="text-[13px] text-[#64748b]">
              {prefecture}
              {municipality} — {spots.length} 件（登録済み観光地は除外済み）
            </p>
            <div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => patchCollect({ categoryFilter: null })}
                  className={`cursor-pointer rounded-full px-3 py-1 text-[13px] transition ${
                    categoryFilter === null
                      ? "bg-[#2563eb] font-medium text-white"
                      : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                  }`}
                >
                  すべて {spots.length}
                </button>
                {categories.map(([cat, count]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      patchCollect({ categoryFilter: categoryFilter === cat ? null : cat })
                    }
                    className={`cursor-pointer rounded-full px-3 py-1 text-[13px] transition ${
                      categoryFilter === cat
                        ? "bg-[#2563eb] font-medium text-white"
                        : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                    }`}
                  >
                    {cat} {count}
                  </button>
                ))}
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-2xs">
                <div
                  className={`grid ${COLLECT_TABLE_GRID_COLS} items-center gap-4 border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-3 text-[13px] font-bold text-[#475569]`}
                >
                  <input
                    type="checkbox"
                    aria-label="表示中をすべて選択"
                    checked={
                      visibleSpots.length > 0 && visibleSpots.every(({ spot }) => spot.selected)
                    }
                    onChange={toggleAll}
                    className="size-4 rounded border-[#e2e8f0]"
                  />
                  <span>観光地名</span>
                  <span>カテゴリ</span>
                  <span>住所</span>
                  <span>紹介文</span>
                  <span>おすすめポイント</span>
                  <span className="text-right">操作</span>
                </div>

                {visibleSpots.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-[#64748b]">
                    該当する観光地がありません
                  </p>
                )}

                {visibleSpots.map(({ spot, index }, idx) =>
                  editing === index ? (
                    <div
                      key={`edit-${index}`}
                      className="border-b border-[#e2e8f0] bg-[#f8fafc] p-4 last:border-0"
                    >
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={spot.name}
                          onChange={(e) => updateSpot(index, { name: e.target.value })}
                          placeholder="例: 道の駅 〇〇"
                          className="min-w-[200px] flex-1 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-medium"
                        />
                      </div>
                      <div className="mt-3">
                        <p className="mb-2 text-xs font-medium text-[#475569]">
                          カテゴリ{" "}
                          <span className="font-normal text-[#64748b]">
                            複数選択可・最大 {MAX_SPOT_CATEGORIES} 件
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {SPOT_CATEGORIES.map((category) => {
                            const active = normalizeCategories(spot.categories).includes(category);
                            const atMax =
                              normalizeCategories(spot.categories).length >= MAX_SPOT_CATEGORIES;
                            return (
                              <button
                                key={category}
                                type="button"
                                disabled={!active && atMax}
                                onClick={() => toggleSpotCategory(index, category)}
                                className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                                  active
                                    ? "cursor-pointer bg-[#2563eb] font-medium text-white"
                                    : atMax
                                      ? "cursor-not-allowed bg-white text-[#94a3b8]"
                                      : "cursor-pointer bg-white text-[#475569] hover:bg-[#e2e8f0]"
                                }`}
                              >
                                {category}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={spot.address}
                        onChange={(e) => updateSpot(index, { address: e.target.value })}
                        placeholder="例: 国道沿い1丁目"
                        className="mt-2 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm"
                      />
                      <div>
                        <textarea
                          value={spot.description}
                          onChange={(e) =>
                            updateSpot(index, {
                              description: e.target.value.slice(0, MAX_SPOT_DESCRIPTION_LENGTH),
                            })
                          }
                          placeholder="例: 地元の特産品や食堂が楽しめる道の駅。旅の休憩・お土産選びに便利です。"
                          rows={3}
                          maxLength={MAX_SPOT_DESCRIPTION_LENGTH}
                          className="mt-2 w-full resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm leading-relaxed"
                        />
                        <p className="mt-1 text-xs text-[#64748b]">
                          最大 {MAX_SPOT_DESCRIPTION_LENGTH} 文字（{spot.description.length}/
                          {MAX_SPOT_DESCRIPTION_LENGTH}）
                        </p>
                      </div>
                      <div>
                        <textarea
                          value={spot.highlights.join("\n")}
                          onChange={(e) =>
                            updateSpot(index, {
                              highlights: parseHighlightsText(enforceHighlightsText(e.target.value)),
                            })
                          }
                          placeholder={`例: 地元野菜の直売所が充実している（1行1件・最大${MAX_SPOT_HIGHLIGHT_COUNT}件・各${MAX_SPOT_HIGHLIGHT_LENGTH}文字）`}
                          rows={3}
                          className="mt-2 w-full resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm leading-relaxed"
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-3">
                        <Button variant="secondary" onClick={cancelEditing}>
                          キャンセル
                        </Button>
                        <Button onClick={finishEditing}>完了</Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`row-${index}`}
                      className={`grid ${COLLECT_TABLE_GRID_COLS} items-start gap-4 border-b border-[#e2e8f0] px-5 py-4 last:border-0 ${
                        idx % 2 === 1 ? "bg-[#f8fafc]" : "bg-white"
                      } ${spot.selected ? "" : "opacity-45"}`}
                    >
                      <input
                        type="checkbox"
                        checked={spot.selected}
                        onChange={() => toggleOne(index)}
                        aria-label={spot.selected ? "選択を外す" : "選択する"}
                        className="size-4 rounded mt-0.5 border-[#e2e8f0]"
                      />
                      <button
                        type="button"
                        onClick={() => toggleOne(index)}
                        className="cursor-pointer truncate text-left text-sm font-medium text-[#2563eb] hover:underline"
                      >
                        {spot.name}
                      </button>
                      <span className="inline-flex flex-wrap gap-1">
                        {normalizeCategories(spot.categories).map((cat) => (
                          <span
                            key={cat}
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${getCategoryStyle(cat)}`}
                          >
                            {cat}
                          </span>
                        ))}
                      </span>
                      <span className="truncate text-[13px] text-[#475569]">{spot.address}</span>
                      <span className="line-clamp-2 text-[13px] leading-relaxed text-[#64748b]">
                        {spot.description}
                      </span>
                      <CollectHighlights highlights={spot.highlights} />
                      <button
                        type="button"
                        onClick={() => startEditing(index)}
                        aria-label={`${spot.name} を編集`}
                        className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center self-center rounded-full text-[#94a3b8] transition hover:bg-[#e2e8f0] hover:text-[#2563eb]"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="my-8 mb-16 rounded-full shadow border-t border-[#e2e8f0] bg-white/95 px-8 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#475569]">
                <span className="font-bold text-[#0f172a]">{selectedCount}</span> / {spots.length}{" "}
                件を選択中
              </p>
              <div className="flex gap-6">
                <Button variant="secondary" onClick={() => setAbortConfirmOpen(true)}>
                  キャンセル
                </Button>
                <Button
                  disabled={selectedCount === 0 || step === "registering"}
                  onClick={() => void handleRegister()}
                >
                  {step === "registering" ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      登録中…
                    </>
                  ) : (
                    `${selectedCount} 件を登録`
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className={pageShell}>
          <div className={`${cardShell} flex flex-col items-center py-20 text-center`}>
            <p className="text-lg font-bold text-[#0f172a]">登録完了</p>
            <p className="mt-2 text-sm text-[#475569]">{result.ok} 件の観光地を登録しました</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => resetCollectDraft()}
              >
                続けて収集
              </Button>
              <Button onClick={() => (window.location.href = "/spots")}>観光地管理へ</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} variant="error" />}

      <Modal
        open={abortConfirmOpen}
        title="収集結果の登録をやめますか？"
        onClose={() => setAbortConfirmOpen(false)}
      >
        <p className="text-sm text-[#475569]">
          AIが提案した観光地の一覧を破棄し、収集の最初に戻ります。編集内容は保存されません。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setAbortConfirmOpen(false)}>
            戻る
          </Button>
          <Button variant="danger" onClick={abortCollectPreview}>
            破棄する
          </Button>
        </div>
      </Modal>
    </>
  );
}

function CollectHighlights({ highlights }: { highlights: string[] }) {
  if (highlights.length === 0) {
    return <span className="text-[13px] text-[#94a3b8]">—</span>;
  }

  return (
    <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug text-[#64748b]">
      {highlights.map((point) => (
        <li key={point} className="line-clamp-2">
          {point}
        </li>
      ))}
    </ul>
  );
}

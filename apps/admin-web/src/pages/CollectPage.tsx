import { Loader2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  bulkImportSpots,
  type CollectedSpotPayload,
  collectSpots,
  generateSpotImage,
  geocodeAddress,
  listSpots,
  lookupPlaceByName,
  readSpotImageFile,
  uploadSpotImageBase64,
} from "../api.ts";
import { CollectSpotImageCell } from "../components/CollectSpotImageCell.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import {
  type CollectDraft,
  type CollectedSpotDraft,
  useSpotAddDraft,
} from "../context/SpotAddDraftContext.tsx";
import { extractAreaFromAddress, resolveSpotArea } from "../lib/address.ts";
import {
  getCategoryStyle,
  MAX_SPOT_CATEGORIES,
  normalizeCategories,
  SPOT_CATEGORIES,
  type SpotCategory,
} from "../lib/categories.ts";
import { COLLECT_TARGET_OPTIONS, MAX_COLLECT_TARGET_COUNT } from "../lib/collect.ts";
import {
  enforceHighlightsText,
  MAX_SPOT_DESCRIPTION_LENGTH,
  MAX_SPOT_HIGHLIGHT_COUNT,
  MAX_SPOT_HIGHLIGHT_LENGTH,
  normalizeHighlights,
  parseHighlightsText,
  trimSpotDescription,
} from "../lib/format.ts";
import { ADMIN_TABLE_PAGE_CLASS } from "../lib/layout.ts";
import { getFixedPrefecture, getMunicipality, type Prefecture } from "../master/index.ts";

type CollectedSpot = CollectedSpotDraft;

/** チェックボックス + 画像 + 観光地名 + カテゴリ + 住所 + 紹介文 + おすすめポイント + 操作 */
const COLLECT_TABLE_GRID_COLS =
  "grid-cols-[16px_7rem_minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_3rem]";

/** 表記ゆれを吸収した名前照合キー（agent側 normalizeSpotName と同じ規則）。 */
function nameKey(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
}

/** 登録済み観光地名を取得する（重複収集・二重登録の防止用）。 */
async function fetchExistingNames(): Promise<string[]> {
  const res = await listSpots({ limit: 1000, prefecture: getFixedPrefecture() });
  return res.spots.map((s) => s.name);
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
    const area = resolveSpotArea(
      address ? extractAreaFromAddress(address, prefecture) || spot.area : spot.area,
      address,
      prefecture,
      spot.name,
    );
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
    area: resolveSpotArea(spot.area, spot.address, prefecture, spot.name),
    selected: true,
    location: location ?? undefined,
  };
}

/** 登録前に入力内容を検証する。 */
function validateCollectedSpot(spot: CollectedSpot): string | null {
  if (!spot.name.trim()) return "観光地名を入力してください";
  if (!spot.address.trim()) return "住所を入力してください";
  if (!trimSpotDescription(spot.description)) return "紹介文を入力してください";
  if (!normalizeHighlights(spot.highlights).length) return "おすすめポイントを入力してください";
  if (!normalizeCategories(spot.categories).length) return "カテゴリを1件以上選択してください";
  return null;
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
  const { prefecture, name: municipality } = getMunicipality();
  // インライン編集中の観光地（spots 配列のインデックス）。null なら非編集。
  const [editing, setEditing] = useState<number | null>(null);
  const [editingBackup, setEditingBackup] = useState<CollectedSpot | null>(null);
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState<{
    index: number;
    kind: "generate" | "upload";
  } | null>(null);

  const selectedCount = spots.filter((s) => s.selected).length;
  const selectedImageReadyCount = spots.filter((s) => s.selected && s.pendingImage).length;
  const isImageBusy = imageBusy !== null;
  const isRegistering = step === "registering";

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
        .filter(
          ({ spot }) =>
            !categoryFilter || normalizeCategories(spot.categories).includes(categoryFilter),
        ),
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
    if (editing === null) return;
    const spot = spots[editing];
    if (!spot) return;
    const validationError = validateCollectedSpot(spot);
    if (validationError) {
      setToast(validationError);
      return;
    }
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
      const excludeNames = await fetchExistingNames();
      const collected = await collectSpots({
        municipality,
        prefecture,
        targetCount: Math.min(targetCount, MAX_COLLECT_TARGET_COUNT),
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

  const handleGenerateSpotImage = async (index: number) => {
    const spot = spots[index];
    if (!spot) return;

    setImageBusy({ index, kind: "generate" });
    try {
      const image = await generateSpotImage({
        name: spot.name,
        prefecture: spot.prefecture || prefecture,
        municipality,
        referenceImage: spot.pendingImage,
      });
      updateSpot(index, {
        pendingImage: { mimeType: image.mimeType, data: image.data },
      });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "画像の作成に失敗しました");
    } finally {
      setImageBusy(null);
    }
  };

  const handleUploadSpotImage = async (index: number, file: File) => {
    setImageBusy({ index, kind: "upload" });
    try {
      const pendingImage = await readSpotImageFile(file);
      updateSpot(index, { pendingImage });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "画像のアップロードに失敗しました");
    } finally {
      setImageBusy(null);
    }
  };

  const handleRemoveSpotImage = (index: number) => {
    updateSpot(index, { pendingImage: undefined });
  };

  const handleRegister = async () => {
    const selected = spots.filter((s) => s.selected);
    if (selected.length === 0) {
      setToast("登録する観光地を選択してください");
      return;
    }
    const invalidSpot = selected.find((spot) => validateCollectedSpot(spot));
    if (invalidSpot) {
      const validationError = validateCollectedSpot(invalidSpot);
      setToast(
        validationError
          ? `${invalidSpot.name || "観光地"}: ${validationError}`
          : "入力内容が不足している観光地があります",
      );
      return;
    }
    if (selected.length > MAX_COLLECT_TARGET_COUNT) {
      setToast(`一度に登録できるのは最大 ${MAX_COLLECT_TARGET_COUNT} 件です`);
      return;
    }
    patchCollect({ step: "registering" });
    try {
      // 収集中に他の経路で登録された分も含め、直前の最新状態で二重登録を防ぐ
      const existingKeys = new Set((await fetchExistingNames()).map(nameKey));
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
        area: resolveSpotArea(s.area, s.address, prefecture, s.name),
        prefecture: s.prefecture || prefecture,
        address: s.address,
        ...(s.location ? { location: s.location } : {}),
      }));
      const res = await bulkImportSpots(spotsToImport);

      const sourceByName = new Map(newSpots.map((s) => [nameKey(s.name), s]));
      let imageOk = 0;
      let imageNg = 0;
      for (const imported of res.spots) {
        const source = sourceByName.get(nameKey(imported.name));
        if (!source?.pendingImage) continue;
        try {
          await uploadSpotImageBase64(
            imported.id,
            source.pendingImage.mimeType,
            source.pendingImage.data,
          );
          imageOk += 1;
        } catch {
          imageNg += 1;
        }
      }

      if (imageNg > 0) {
        setToast(
          imageOk > 0
            ? `${imageOk} 件の画像を保存しましたが、${imageNg} 件は失敗しました`
            : `観光地は登録されましたが、画像の保存に失敗しました（${imageNg} 件）`,
        );
      }

      patchCollect({
        result: imageOk > 0 ? { ok: res.count, imageOk } : { ok: res.count },
        step: "done",
      });
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
                <p className="mb-3 text-sm font-medium text-[#0f172a]">
                  目標件数{" "}
                  <span className="text-xs font-normal text-[#64748b]">
                    （最大 {MAX_COLLECT_TARGET_COUNT} 件）
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLLECT_TARGET_OPTIONS.map((n) => (
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
              <Button onClick={() => void handleCollect()}>収集開始</Button>
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
        <div className={ADMIN_TABLE_PAGE_CLASS}>
          <div className={cardShell}>
            <div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isRegistering}
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
                    disabled={isRegistering}
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
                    disabled={isRegistering}
                    checked={
                      visibleSpots.length > 0 && visibleSpots.every(({ spot }) => spot.selected)
                    }
                    onChange={toggleAll}
                    className="size-4 rounded border-[#e2e8f0]"
                  />
                  <span className="text-[12px]">画像</span>
                  <span>観光地名</span>
                  <span>カテゴリ</span>
                  <span>住所</span>
                  <span>紹介文</span>
                  <span>　おすすめポイント</span>
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
                      <fieldset disabled={isRegistering} className="min-w-0 border-0 p-0">
                        <p className="mb-2 text-xs font-medium text-[#475569]">観光地名</p>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={spot.name}
                            onChange={(e) => updateSpot(index, { name: e.target.value })}
                            placeholder="例: 道の駅 〇〇"
                            className="min-w-[200px] flex-1 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-medium"
                          />
                        </div>
                        <div className="mt-3 max-w-28">
                          <p className="mb-2 text-xs font-medium text-[#475569]">画像</p>
                          <CollectSpotImageCell
                            spot={spot}
                            busy={imageBusy?.index === index ? imageBusy.kind : null}
                            disabled={step === "registering" || isImageBusy || isRegistering}
                            onGenerate={() => void handleGenerateSpotImage(index)}
                            onUpload={(file) => void handleUploadSpotImage(index, file)}
                            onRemove={() => handleRemoveSpotImage(index)}
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
                              const active = normalizeCategories(spot.categories).includes(
                                category,
                              );
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
                        <p className="mt-3 mb-2 text-xs font-medium text-[#475569]">住所</p>
                        <input
                          type="text"
                          value={spot.address}
                          onChange={(e) => updateSpot(index, { address: e.target.value })}
                          placeholder="例: 国道沿い1丁目"
                          className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm"
                        />
                        <div>
                          <p className="mt-3 mb-2 text-xs font-medium text-[#475569]">紹介文</p>
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
                            className="w-full resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm leading-relaxed"
                          />
                          <p className="mt-1 text-xs text-[#64748b]">
                            最大 {MAX_SPOT_DESCRIPTION_LENGTH} 文字（{spot.description.length}/
                            {MAX_SPOT_DESCRIPTION_LENGTH}）
                          </p>
                        </div>
                        <div>
                          <p className="mt-3 mb-2 text-xs font-medium text-[#475569]">
                            おすすめポイント
                          </p>
                          <textarea
                            value={spot.highlights.join("\n")}
                            onChange={(e) =>
                              updateSpot(index, {
                                highlights: parseHighlightsText(
                                  enforceHighlightsText(e.target.value),
                                ),
                              })
                            }
                            placeholder={`例: 地元野菜の直売所が充実している（1行1件・最大${MAX_SPOT_HIGHLIGHT_COUNT}件・各${MAX_SPOT_HIGHLIGHT_LENGTH}文字）`}
                            rows={3}
                            className="w-full resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm leading-relaxed"
                          />
                        </div>
                        <div className="mt-3 flex justify-end gap-3">
                          <Button
                            variant="secondary"
                            disabled={isRegistering}
                            onClick={cancelEditing}
                          >
                            キャンセル
                          </Button>
                          <Button disabled={isRegistering} onClick={finishEditing}>
                            完了
                          </Button>
                        </div>
                      </fieldset>
                    </div>
                  ) : (
                    <div
                      key={`row-${index}`}
                      className={`grid ${COLLECT_TABLE_GRID_COLS} items-center gap-4 border-b border-[#e2e8f0] px-5 py-4 last:border-0 ${
                        idx % 2 === 1 ? "bg-[#f8fafc]" : "bg-white"
                      } ${spot.selected ? "" : "opacity-45"}`}
                    >
                      <input
                        type="checkbox"
                        checked={spot.selected}
                        disabled={isRegistering}
                        onChange={() => toggleOne(index)}
                        aria-label={spot.selected ? "選択を外す" : "選択する"}
                        className="size-4 rounded border-[#e2e8f0]"
                      />
                      <CollectSpotImageCell
                        spot={spot}
                        busy={imageBusy?.index === index ? imageBusy.kind : null}
                        disabled={step === "registering" || isImageBusy || isRegistering}
                        onGenerate={() => void handleGenerateSpotImage(index)}
                        onUpload={(file) => void handleUploadSpotImage(index, file)}
                        onRemove={() => handleRemoveSpotImage(index)}
                      />

                      <span className="truncate text-sm font-medium text-[#475569]">
                        {spot.name}
                      </span>

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
                        disabled={isRegistering}
                        onClick={() => startEditing(index)}
                        aria-label={`${spot.name} を編集`}
                        className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#94a3b8] transition hover:bg-[#e2e8f0] hover:text-[#2563eb]"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="my-8 mb-16 rounded-2xl border border-[#e2e8f0] bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 text-sm text-[#475569]">
                <p>
                  <span className="font-bold text-[#0f172a]">{selectedCount}</span> / {spots.length}{" "}
                  件を選択中
                </p>
                {selectedCount > 0 && (
                  <p className="text-xs text-[#64748b]">
                    選択中の画像設定: {selectedImageReadyCount} / {selectedCount} 件
                  </p>
                )}
              </div>
              <div className="flex gap-6">
                <Button
                  variant="secondary"
                  disabled={isRegistering}
                  onClick={() => setAbortConfirmOpen(true)}
                >
                  キャンセル
                </Button>
                <Button
                  disabled={selectedCount === 0 || isRegistering || isImageBusy}
                  onClick={() => void handleRegister()}
                >
                  {isRegistering ? (
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
            {result.imageOk != null && (
              <p className="mt-1 text-sm text-[#64748b]">
                画像付き登録: {result.imageOk} / {result.ok} 件
              </p>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => resetCollectDraft()}>
                続けて収集
              </Button>
              <Button onClick={() => (window.location.href = "/spots")}>観光地管理へ</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} variant="error" onClose={() => setToast(null)} />}

      <Modal
        open={abortConfirmOpen}
        title="収集結果の登録をやめますか？"
        onClose={() => !isRegistering && setAbortConfirmOpen(false)}
      >
        <p className="text-sm text-[#475569]">
          AIが提案した観光地の一覧を破棄し、収集の最初に戻ります。編集内容は保存されません。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={isRegistering}
            onClick={() => setAbortConfirmOpen(false)}
          >
            戻る
          </Button>
          <Button variant="danger" disabled={isRegistering} onClick={abortCollectPreview}>
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

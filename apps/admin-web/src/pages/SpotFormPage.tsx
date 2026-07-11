import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createSpot,
  deleteSpot,
  generateSpotContent,
  generateSpotImage,
  getSpot,
  isAbortError,
  lookupPlaceByName,
  resolveReferenceImageForGenerate,
  spotImageResultToFile,
  updateSpot,
} from "../api.ts";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { SpotImageField, uploadPendingSpotImage } from "../components/SpotImageField.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Input } from "../components/ui/Input.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import {
  emptyManualFormDraft,
  type ManualFormDraft,
  useSpotAddDraft,
} from "../context/SpotAddDraftContext.tsx";
import { extractAreaFromAddress, resolveSpotArea } from "../lib/address.ts";
import {
  MAX_SPOT_CATEGORIES,
  normalizeCategories,
  SPOT_CATEGORIES,
  type SpotCategory,
} from "../lib/categories.ts";
import {
  enforceHighlightsText,
  formatDateTime,
  formatHighlightsText,
  MAX_SPOT_DESCRIPTION_LENGTH,
  parseHighlightsText,
  trimSpotDescription,
} from "../lib/format.ts";
import { getFixedPrefecture, getMunicipality } from "../master/index.ts";
import type { Spot } from "../types.ts";

const MAX_DESCRIPTION_LENGTH = MAX_SPOT_DESCRIPTION_LENGTH;

type FormState = ManualFormDraft;

const emptyForm = emptyManualFormDraft;

type FormSnapshot = {
  name: string;
  description: string;
  highlights: string;
  categories: string[];
  address: string;
  area: string;
  imageUrl?: string;
  hasPendingImage: boolean;
};

function toFormSnapshot(form: FormState, pendingImageFile: File | null): FormSnapshot {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    highlights: form.highlights.trim(),
    categories: [...form.categories].sort(),
    address: form.address.trim(),
    area: form.area.trim(),
    imageUrl: form.imageUrl?.split("?")[0],
    hasPendingImage: pendingImageFile !== null,
  };
}

function formSnapshotsEqual(a: FormSnapshot, b: FormSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const emptyFormSnapshot = toFormSnapshot(emptyManualFormDraft(), null);

export default function SpotFormPage({ embedded = false }: { embedded?: boolean } = {}) {
  const municipality = getMunicipality();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { manualDraft, setManualDraft, resetManualDraft, setDataOperationBusy } = useSpotAddDraft();
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const form = embedded ? manualDraft : editForm;
  const setForm = embedded ? setManualDraft : setEditForm;
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [showDelete, setShowDelete] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [editBaseline, setEditBaseline] = useState<FormSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lookingUpPlace, setLookingUpPlace] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingHighlights, setGeneratingHighlights] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const imageGenerateAbortRef = useRef<AbortController | null>(null);
  const [descriptionGenerateMiss, setDescriptionGenerateMiss] = useState(false);
  const [highlightsGenerateMiss, setHighlightsGenerateMiss] = useState(false);
  const [imageGenerateMiss, setImageGenerateMiss] = useState(false);
  const [placeLookupMiss, setPlaceLookupMiss] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const nameLookupSkipRef = useRef(isEdit);

  const formSaving = saving || deleting;
  const formGenerating = generatingImage || generatingDescription || generatingHighlights;
  const formBusy = formSaving || formGenerating;

  useEffect(() => {
    if (!embedded) return;
    setDataOperationBusy(formBusy);
    return () => setDataOperationBusy(false);
  }, [embedded, formBusy, setDataOperationBusy]);

  useEffect(() => {
    if (!id) return;
    setLoadError(null);
    nameLookupSkipRef.current = true;
    getSpot(id)
      .then((spot) => {
        const loadedForm: FormState = {
          id: spot.id,
          name: spot.name,
          description: spot.description,
          highlights: formatHighlightsText(spot.highlights ?? []),
          categories: normalizeCategories(spot.category),
          address: spot.address ?? "",
          area:
            spot.area ??
            (extractAreaFromAddress(spot.address ?? "", getFixedPrefecture()) ||
              municipality.defaultArea),
          imageUrl: spot.imageUrl,
        };
        setEditForm(loadedForm);
        setEditBaseline(toFormSnapshot(loadedForm, null));
        setUpdatedAt(spot.updatedAt);
      })
      .catch(() => setLoadError("観光地の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [id, municipality.defaultArea]);

  useEffect(() => {
    const name = form.name.trim();
    if (name.length < 2 || nameLookupSkipRef.current) return;

    const timer = window.setTimeout(() => {
      setLookingUpPlace(true);
      setPlaceLookupMiss(false);
      void lookupPlaceByName(name, {
        prefecture: getFixedPrefecture(),
        municipality: municipality.name,
      })
        .then((result) => {
          if (nameLookupSkipRef.current) return;
          if (!result) {
            setPlaceLookupMiss(true);
            return;
          }
          setPlaceLookupMiss(false);
          setForm((prev) => {
            if (prev.name.trim() !== name) return prev;

            const address = result.address ?? prev.address;
            const area = address
              ? extractAreaFromAddress(address, getFixedPrefecture()) || municipality.defaultArea
              : prev.area;

            return {
              ...prev,
              ...(address ? { address } : {}),
              area,
              ...(result.category
                ? {
                    categories: normalizeCategories([
                      ...prev.categories,
                      ...(Array.isArray(result.category) ? result.category : [result.category]),
                    ]),
                  }
                : {}),
            };
          });
        })
        .finally(() => setLookingUpPlace(false));
    }, 600);

    return () => window.clearTimeout(timer);
  }, [form.name, setForm, municipality.name, municipality.defaultArea]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setSpotName = (value: string) => {
    nameLookupSkipRef.current = false;
    setPlaceLookupMiss(false);
    setField("name", value);
  };

  const baseline = isEdit ? editBaseline : emptyFormSnapshot;
  const currentSnapshot = useMemo(
    () => toFormSnapshot(form, pendingImageFile),
    [form, pendingImageFile],
  );
  const isDirty = baseline !== null && !formSnapshotsEqual(baseline, currentSnapshot);

  const leaveForm = () => {
    if (embedded) {
      resetManualDraft();
    }
    setPendingImageFile(null);
    navigate("/spots");
  };

  const handleCancel = () => {
    if (formBusy) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    leaveForm();
  };

  const spotGenerateParams = () => ({
    name: form.name.trim(),
    prefecture: getFixedPrefecture(),
    municipality: municipality.name,
    address: form.address.trim() || undefined,
  });

  const handleGenerateDescription = async () => {
    const name = form.name.trim();
    if (name.length < 2) {
      setErrors((prev) => ({ ...prev, name: "観光地名を入力してください" }));
      return;
    }

    setGeneratingDescription(true);
    setDescriptionGenerateMiss(false);
    setErrors((prev) => ({ ...prev, description: undefined }));

    const described = await generateSpotContent(spotGenerateParams(), "description");

    if (described?.description) {
      setForm((prev) => ({
        ...prev,
        description: trimSpotDescription(described.description ?? ""),
        ...(described.category
          ? {
              categories: normalizeCategories([...prev.categories, described.category]),
            }
          : {}),
      }));
    } else {
      setDescriptionGenerateMiss(true);
    }

    setGeneratingDescription(false);
  };

  const handleGenerateHighlights = async () => {
    const name = form.name.trim();
    if (name.length < 2) {
      setErrors((prev) => ({ ...prev, name: "観光地名を入力してください" }));
      return;
    }

    setGeneratingHighlights(true);
    setHighlightsGenerateMiss(false);

    const described = await generateSpotContent(spotGenerateParams(), "highlights");

    if (described?.highlights?.length) {
      setForm((prev) => ({
        ...prev,
        highlights: formatHighlightsText(described.highlights ?? []),
      }));
    } else {
      setHighlightsGenerateMiss(true);
    }

    setGeneratingHighlights(false);
  };

  const handleGenerateImage = async () => {
    imageGenerateAbortRef.current?.abort();
    const controller = new AbortController();
    imageGenerateAbortRef.current = controller;
    setGeneratingImage(true);
    setImageGenerateMiss(false);

    try {
      const params = spotGenerateParams();
      const spotName = params.name || "観光スポット";
      const referenceImage = await resolveReferenceImageForGenerate({
        pendingFile: pendingImageFile,
        imageUrl: form.imageUrl,
        spotId: isEdit ? id : undefined,
      });
      if (!referenceImage) {
        setImageGenerateMiss(true);
        return;
      }
      const image = await generateSpotImage({
        name: spotName,
        prefecture: params.prefecture,
        municipality: params.municipality,
        address: params.address,
        referenceImage,
        signal: controller.signal,
      });
      const file = spotImageResultToFile(image, spotName);
      setPendingImageFile(file);
    } catch (e) {
      if (isAbortError(e)) return;
      setImageGenerateMiss(true);
      if (e instanceof Error && e.message) {
        setToast(e.message);
      }
    } finally {
      if (imageGenerateAbortRef.current === controller) {
        imageGenerateAbortRef.current = null;
      }
      setGeneratingImage(false);
    }
  };

  const handleCancelGenerateImage = () => {
    imageGenerateAbortRef.current?.abort();
  };

  const setAddress = (value: string) => {
    const derivedArea = extractAreaFromAddress(value, getFixedPrefecture());
    setForm((prev) => ({
      ...prev,
      address: value,
      area: derivedArea || (value.trim() ? municipality.defaultArea : prev.area),
    }));
    setErrors((prev) => ({ ...prev, address: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "観光地名を入力してください";
    if (!form.address.trim()) next.address = "住所を入力してください";
    if (!form.description.trim()) next.description = "紹介文を入力してください";
    else if (form.description.length > MAX_DESCRIPTION_LENGTH) {
      next.description = `${MAX_DESCRIPTION_LENGTH}文字以内で入力してください`;
    }
    if (!parseHighlightsText(form.highlights).length) {
      next.highlights = "おすすめポイントを入力してください";
    }
    if (form.categories.length === 0) {
      next.categories = "カテゴリを1件以上選択してください";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildSpot = (): Spot => {
    const address = form.address.trim();
    const area = resolveSpotArea(form.area, address, getFixedPrefecture(), form.name);
    const highlights = parseHighlightsText(form.highlights);

    return {
      id: isEdit ? form.id.trim() : crypto.randomUUID(),
      name: form.name.trim(),
      description: form.description.trim(),
      ...(form.categories.length ? { category: form.categories } : {}),
      prefecture: getFixedPrefecture(),
      ...(address ? { address } : {}),
      ...(area ? { area } : {}),
      ...(highlights.length ? { highlights } : {}),
    };
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && id) {
        if (pendingImageFile) {
          const imageUrl = await uploadPendingSpotImage(id, pendingImageFile);
          if (imageUrl) {
            setField("imageUrl", imageUrl);
          }
        }
        const { id: _id, ...patch } = buildSpot();
        await updateSpot(id, patch);
      } else {
        const created = await createSpot(buildSpot());
        if (pendingImageFile) {
          await uploadPendingSpotImage(created.id, pendingImageFile);
        }
        if (embedded) resetManualDraft();
      }
      setPendingImageFile(null);
      setToast("観光地を保存しました。検索インデックスへ反映中…");
      setTimeout(() => navigate("/spots"), 1200);
    } catch {
      setToast("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteSpot(id);
      setShowDelete(false);
      navigate("/spots");
    } catch {
      setToast("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const toggleCategory = (category: SpotCategory) => {
    if (form.categories.includes(category)) {
      setField(
        "categories",
        form.categories.filter((c) => c !== category),
      );
      return;
    }
    if (form.categories.length >= MAX_SPOT_CATEGORIES) return;
    setField("categories", [...form.categories, category]);
  };

  const atMaxCategories = form.categories.length >= MAX_SPOT_CATEGORIES;

  const wrap = (children: ReactNode) =>
    embedded ? (
      children
    ) : (
      <AdminShell title={isEdit ? "tabipla管理" : "tabipla管理"}>{children}</AdminShell>
    );

  if (loading) {
    return wrap(<p className="p-8 text-sm text-[#64748b]">読み込み中…</p>);
  }

  if (loadError) {
    return wrap(
      <div className="mx-auto max-w-[640px] p-8 text-center">
        <p className="text-sm text-[#64748b]">{loadError}</p>
        <Button className="mt-6" variant="secondary" onClick={() => navigate("/spots")}>
          観光地管理へ戻る
        </Button>
      </div>,
    );
  }

  return wrap(
    <>
      <div className="px-8">
        {!embedded && (
          <div className="my-6">
            {isEdit && updatedAt && (
              <p className="mt-1 text-sm text-[#94a3b8]">最終更新: {formatDateTime(updatedAt)}</p>
            )}
          </div>
        )}

        <div className="mx-auto w-full pb-8">
          <fieldset disabled={formSaving} className="min-w-0 border-0 p-0">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="lg:col-span-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <label htmlFor="spot-name" className="text-sm font-medium text-[#0f172a]">
                    観光地名
                  </label>
                  {!isEdit && (
                    <span className="text-xs text-[#64748b]">
                      {lookingUpPlace
                        ? "観光地名から情報を取得中…"
                        : placeLookupMiss
                          ? "該当する観光地が見つかりませんでした。住所を直接入力してください。"
                          : "入力すると住所が自動入力されます。"}
                    </span>
                  )}
                </div>
                <input
                  id="spot-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setSpotName(e.target.value)}
                  placeholder="例: 道の駅 〇〇"
                  className={`h-11 rounded-lg border px-3 text-sm outline-none transition focus:ring-2 focus:ring-[#2563eb]/30 ${
                    errors.name
                      ? "border-[#dc2626] bg-white"
                      : "border-[#e2e8f0] bg-white focus:border-[#2563eb]"
                  }`}
                />
                {errors.name && <p className="text-xs text-[#dc2626]">{errors.name}</p>}
              </div>
              <Input
                label="住所"
                value={form.address}
                onChange={setAddress}
                placeholder="例: 国道沿い1丁目"
                error={errors.address}
                className="lg:col-span-2"
              />
              <SpotImageField
                spotId={isEdit ? id : undefined}
                imageUrl={form.imageUrl}
                pendingFile={pendingImageFile}
                onImageUrlChange={(imageUrl) => setField("imageUrl", imageUrl)}
                onPendingFileChange={setPendingImageFile}
                disabled={formSaving}
                generating={generatingImage}
                onGenerate={() => void handleGenerateImage()}
                onCancelGenerate={handleCancelGenerateImage}
                generateMiss={imageGenerateMiss}
              />
              <div className="lg:col-span-2">
                <div className="mb-2 flex flex-wrap items-end gap-4">
                  <label htmlFor="spot-description" className="text-sm font-medium text-[#0f172a]">
                    紹介文
                  </label>
                  {!errors.description && (
                    <p className="mt-2 text-xs text-[#64748b]">
                      {descriptionGenerateMiss
                        ? "紹介文を自動生成できませんでした。手動で入力するか、もう一度お試しください。"
                        : `${form.description.length}/${MAX_DESCRIPTION_LENGTH}文字`}
                    </p>
                  )}
                  <button
                    type="button"
                    className="cursor-pointer rounded-full text-xs text-[#2563eb] underline transition enabled:hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={formSaving || generatingDescription || form.name.trim().length < 2}
                    onClick={() => void handleGenerateDescription()}
                  >
                    {generatingDescription ? "作成中…" : "AIで作成"}
                  </button>
                </div>
                <textarea
                  id="spot-description"
                  value={form.description}
                  rows={6}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  placeholder="例: 地元の特産品や食堂が楽しめる道の駅。旅の休憩・お土産選びに便利です。"
                  onChange={(e) => {
                    setDescriptionGenerateMiss(false);
                    setField("description", e.target.value);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 bg-white ${
                    errors.description ? "border-[#dc2626]" : "border-[#e2e8f0]"
                  }`}
                />
                {errors.description && (
                  <p className="mt-2 text-xs text-[#dc2626]">{errors.description}</p>
                )}
              </div>
              <div className="lg:col-span-2">
                <div className="mb-2 flex flex-wrap items-end gap-4">
                  <label htmlFor="spot-highlights" className="text-sm font-medium text-[#0f172a]">
                    おすすめポイント
                  </label>

                  <span className="text-xs text-[#64748b]">
                    {highlightsGenerateMiss
                      ? "おすすめポイントを自動生成できませんでした。手動で入力するか、もう一度お試しください。"
                      : "1行1件（最大3件・各30文字）"}
                  </span>
                  <button
                    type="button"
                    className="cursor-pointer rounded-full text-xs text-[#2563eb] underline transition enabled:hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={formSaving || generatingHighlights || form.name.trim().length < 2}
                    onClick={() => void handleGenerateHighlights()}
                  >
                    {generatingHighlights ? "作成中…" : "AIで作成"}
                  </button>
                </div>
                <textarea
                  id="spot-highlights"
                  value={form.highlights}
                  rows={4}
                  placeholder={
                    "例: 地元野菜の直売所が充実している\n例: 名物メニューの食堂が人気\n例: 展望デッキの景色がきれい"
                  }
                  onChange={(e) => {
                    setHighlightsGenerateMiss(false);
                    setField("highlights", enforceHighlightsText(e.target.value));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 bg-white ${
                    errors.highlights ? "border-[#dc2626]" : "border-[#e2e8f0]"
                  }`}
                />
                {errors.highlights && (
                  <p className="mt-2 text-xs text-[#dc2626]">{errors.highlights}</p>
                )}
              </div>
              <div className="lg:col-span-2">
                <p className="mb-3 text-sm font-medium text-[#0f172a]">
                  カテゴリ{" "}
                  <span className="text-xs text-[#64748b]">
                    複数選択可・最大 {MAX_SPOT_CATEGORIES} 件
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {SPOT_CATEGORIES.map((category) => {
                    const active = form.categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        disabled={!active && atMaxCategories}
                        onClick={() => toggleCategory(category)}
                        className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                          active
                            ? "cursor-pointer bg-[#2563eb] font-medium text-white"
                            : atMaxCategories
                              ? "cursor-not-allowed bg-white text-[#94a3b8]"
                              : "cursor-pointer bg-white text-[#475569] hover:bg-[#e2e8f0]"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
                {errors.categories && (
                  <p className="mt-2 text-xs text-[#dc2626]">{errors.categories}</p>
                )}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between pt-6">
              {isEdit ? (
                <Button
                  type="button"
                  disabled={formBusy}
                  className="bg-transparent text-[#dc2626]! border border-[#dc2626]! hover:bg-transparent! hover:opacity-50"
                  onClick={() => setShowDelete(true)}
                >
                  削除
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <Button variant="secondary" disabled={formBusy} onClick={handleCancel}>
                  キャンセル
                </Button>
                <Button disabled={formBusy} onClick={() => void handleSave()}>
                  {saving ? "保存中…" : "保存して公開"}
                </Button>
              </div>
            </div>
          </fieldset>
        </div>
      </div>

      <Modal
        open={showDelete}
        title="観光地を削除しますか？"
        onClose={() => !formBusy && setShowDelete(false)}
      >
        <p className="text-sm text-[#475569]">
          「{form.name}
          」を削除すると、旅行者向けアプリからも非表示になります。この操作は取り消せません。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={formBusy} onClick={() => setShowDelete(false)}>
            キャンセル
          </Button>
          <Button variant="danger" disabled={formBusy} onClick={() => void handleDelete()}>
            {deleting ? "削除中…" : "削除する"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={showDiscardConfirm}
        title="変更を破棄しますか？"
        onClose={() => !formBusy && setShowDiscardConfirm(false)}
      >
        <p className="text-sm text-[#475569]">
          保存していない変更があります。このページを離れると、入力内容は失われます。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={formBusy}
            onClick={() => setShowDiscardConfirm(false)}
          >
            編集を続ける
          </Button>
          <Button variant="danger" disabled={formBusy} onClick={leaveForm}>
            破棄して戻る
          </Button>
        </div>
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>,
  );
}

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createSpot,
  deleteSpot,
  geocodeAddress,
  getSpot,
  lookupPlaceByName,
  updateSpot,
} from "../api.ts";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Input, Textarea } from "../components/ui/Input.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import { extractAreaFromAddress } from "../lib/address.ts";
import {
  MAX_SPOT_CATEGORIES,
  normalizeCategories,
  SPOT_CATEGORIES,
  type SpotCategory,
} from "../lib/categories.ts";
import { formatDateTime, MAX_SPOT_DESCRIPTION_LENGTH } from "../lib/format.ts";
import { getFixedPrefecture, MUNICIPALITY } from "../master/index.ts";
import type { Spot } from "../types.ts";

const MAX_DESCRIPTION_LENGTH = MAX_SPOT_DESCRIPTION_LENGTH;

type FormState = {
  id: string;
  name: string;
  description: string;
  categories: string[];
  address: string;
  area: string;
  lat: string;
  lon: string;
};

const emptyForm = (): FormState => ({
  id: "",
  name: "",
  description: "",
  categories: [],
  address: "",
  area: MUNICIPALITY.defaultArea,
  lat: "",
  lon: "",
});

export default function SpotFormPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [showDelete, setShowDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lookingUpPlace, setLookingUpPlace] = useState(false);
  const [placeLookupMiss, setPlaceLookupMiss] = useState(false);
  const coordsManualRef = useRef(false);
  const nameLookupSkipRef = useRef(isEdit);

  useEffect(() => {
    if (!id) return;
    setLoadError(null);
    nameLookupSkipRef.current = true;
    getSpot(id)
      .then((spot) => {
        coordsManualRef.current = true;
        setForm({
          id: spot.id,
          name: spot.name,
          description: spot.description,
          categories: normalizeCategories(spot.category),
          address: spot.address ?? "",
          area:
            spot.area ??
            (extractAreaFromAddress(spot.address ?? "", getFixedPrefecture()) ||
              MUNICIPALITY.defaultArea),
          lat: spot.location?.lat != null ? String(spot.location.lat) : "",
          lon: spot.location?.lon != null ? String(spot.location.lon) : "",
        });
        setUpdatedAt(spot.updatedAt);
      })
      .catch(() => setLoadError("観光地の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const address = form.address.trim();
    if (!address || coordsManualRef.current) return;

    const timer = window.setTimeout(() => {
      void geocodeAddress(address).then((location) => {
        if (!location || coordsManualRef.current) return;
        setForm((prev) => {
          if (prev.address.trim() !== address) return prev;
          return {
            ...prev,
            lat: String(location.lat),
            lon: String(location.lon),
          };
        });
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [form.address]);

  useEffect(() => {
    const name = form.name.trim();
    if (name.length < 2 || nameLookupSkipRef.current) return;

    const timer = window.setTimeout(() => {
      setLookingUpPlace(true);
      setPlaceLookupMiss(false);
      void lookupPlaceByName(name, {
        prefecture: getFixedPrefecture(),
        municipality: MUNICIPALITY.name,
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
              ? extractAreaFromAddress(address, getFixedPrefecture()) || MUNICIPALITY.defaultArea
              : prev.area;

            coordsManualRef.current = true;

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
              ...(result.description && !prev.description.trim()
                ? { description: result.description.slice(0, MAX_DESCRIPTION_LENGTH) }
                : {}),
              lat: String(result.lat),
              lon: String(result.lon),
            };
          });
        })
        .finally(() => setLookingUpPlace(false));
    }, 600);

    return () => window.clearTimeout(timer);
  }, [form.name]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setSpotName = (value: string) => {
    nameLookupSkipRef.current = false;
    setPlaceLookupMiss(false);
    setField("name", value);
  };

  const setAddress = (value: string) => {
    coordsManualRef.current = false;
    const derivedArea = extractAreaFromAddress(value, getFixedPrefecture());
    setForm((prev) => ({
      ...prev,
      address: value,
      area: derivedArea || (value.trim() ? MUNICIPALITY.defaultArea : prev.area),
    }));
    setErrors((prev) => ({ ...prev, address: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "必須項目です";
    if (!form.description.trim()) next.description = "必須項目です";
    else if (form.description.length > MAX_DESCRIPTION_LENGTH) {
      next.description = `${MAX_DESCRIPTION_LENGTH}文字以内で入力してください`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildSpot = (): Spot => {
    const address = form.address.trim();
    const area = form.area.trim() || MUNICIPALITY.defaultArea;

    return {
      id: isEdit ? form.id.trim() : crypto.randomUUID(),
      name: form.name.trim(),
      description: form.description.trim(),
      ...(form.categories.length ? { category: form.categories } : {}),
      prefecture: getFixedPrefecture(),
      ...(address ? { address } : {}),
      ...(area ? { area } : {}),
      tags: [],
      ...(form.lat && form.lon
        ? { location: { lat: Number(form.lat), lon: Number(form.lon) } }
        : {}),
    };
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && id) {
        const { id: _id, ...patch } = buildSpot();
        await updateSpot(id, patch);
      } else {
        await createSpot(buildSpot());
      }
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
    try {
      await deleteSpot(id);
      navigate("/spots");
    } catch {
      setToast("削除に失敗しました");
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
                placeholder="例: 懐古園"
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
              placeholder="例: 長野県小諸市中央1丁目"
              className="lg:col-span-2"
            />
            <div className="lg:col-span-2">
              <Textarea
                label="紹介文"
                value={form.description}
                onChange={(v) => setField("description", v)}
                error={errors.description}
                placeholder="例: 小諸城址の公園。紅葉の名所として知られ、春には桜、秋には紅葉が楽しめます。"
                hint={`最大 ${MAX_DESCRIPTION_LENGTH} 文字（${form.description.length}/${MAX_DESCRIPTION_LENGTH}）`}
                maxLength={MAX_DESCRIPTION_LENGTH}
                className="bg-white"
              />
            </div>
            <div className="lg:col-span-2">
              <p className="mb-3 text-sm font-medium text-[#0f172a]">
                カテゴリ{" "}
                <span className="text-xs text-[#64748b]">
                  （複数選択可・最大 {MAX_SPOT_CATEGORIES} 件）
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
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between pt-6">
            {isEdit ? (
              <Button variant="danger" onClick={() => setShowDelete(true)}>
                削除
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => navigate("/spots")}>
                キャンセル
              </Button>
              <Button disabled={saving} onClick={() => void handleSave()}>
                {saving ? "保存中…" : "保存して公開"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={showDelete} title="観光地を削除しますか？" onClose={() => setShowDelete(false)}>
        <p className="text-sm text-[#475569]">
          「{form.name}
          」を削除すると、旅行者向けアプリからも非表示になります。この操作は取り消せません。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowDelete(false)}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()}>
            削除する
          </Button>
        </div>
      </Modal>

      {toast && <Toast message={toast} />}
    </>,
  );
}

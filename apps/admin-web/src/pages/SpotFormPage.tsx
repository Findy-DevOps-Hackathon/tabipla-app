import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { MapPreview } from "../components/MapPreview.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Input, Textarea } from "../components/ui/Input.tsx";
import { Modal, Toast } from "../components/ui/Modal.tsx";
import { extractAreaFromAddress } from "../lib/address.ts";
import { addCategory, MAX_SPOT_CATEGORIES, normalizeCategories } from "../lib/categories.ts";
import { formatDateTime } from "../lib/format.ts";
import { getFixedPrefecture, MUNICIPALITY } from "../master/index.ts";
import { SPOT_CATEGORIES, type Spot } from "../types.ts";

type FormState = {
  id: string;
  name: string;
  description: string;
  categories: string[];
  address: string;
  area: string;
  lat: string;
  lon: string;
  price: string;
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
  price: "",
});

export default function SpotFormPage() {
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
  const [geocoding, setGeocoding] = useState(false);
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
          price: spot.price != null ? String(spot.price) : "",
        });
        setUpdatedAt(spot.updatedAt);
      })
      .catch(() => setLoadError("スポットの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const address = form.address.trim();
    if (!address || coordsManualRef.current) return;

    const timer = window.setTimeout(() => {
      setGeocoding(true);
      void geocodeAddress(address)
        .then((location) => {
          if (!location || coordsManualRef.current) return;
          setForm((prev) => {
            if (prev.address.trim() !== address) return prev;
            return {
              ...prev,
              lat: String(location.lat),
              lon: String(location.lon),
            };
          });
        })
        .finally(() => setGeocoding(false));
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
                ? { description: result.description }
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

  const setAreaField = (value: string) => {
    setField("area", value);
  };

  const setCoordField = (key: "lat" | "lon", value: string) => {
    coordsManualRef.current = true;
    setField(key, value);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "必須項目です";
    if (!form.description.trim()) next.description = "必須項目です";
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
      ...(form.price !== "" ? { price: Number(form.price) } : {}),
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
      setToast("スポットを保存しました。検索インデックスへ反映中…");
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

  const addCategoryFromValue = (value: string) => {
    const next = addCategory(form.categories, value);
    if (next === form.categories) return;
    setField("categories", next);
  };

  const selectableCategories = SPOT_CATEGORIES.filter((cat) => !form.categories.includes(cat));
  const mapLat = form.lat !== "" ? Number(form.lat) : undefined;
  const mapLon = form.lon !== "" ? Number(form.lon) : undefined;

  const handleMapLocationSelect = useCallback((lat: number, lon: number) => {
    coordsManualRef.current = true;
    setForm((prev) => ({
      ...prev,
      lat: String(lat),
      lon: String(lon),
    }));
  }, []);

  if (loading) {
    return (
      <AdminShell title="スポット管理">
        <p className="p-8 text-sm text-[#64748b]">読み込み中…</p>
      </AdminShell>
    );
  }

  if (loadError) {
    return (
      <AdminShell title="スポット管理">
        <div className="mx-auto max-w-[640px] p-8 text-center">
          <p className="text-sm text-[#64748b]">{loadError}</p>
          <Button className="mt-6" variant="secondary" onClick={() => navigate("/spots")}>
            スポット一覧へ戻る
          </Button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="スポット管理">
      <div className="mx-auto max-w-[1200px] p-8">
        <div className="mb-6">
          <p className="text-sm text-[#64748b]">スポット管理 / {isEdit ? "編集" : "新規登録"}</p>
          {isEdit && updatedAt && (
            <p className="mt-1 text-sm text-[#94a3b8]">最終更新: {formatDateTime(updatedAt)}</p>
          )}
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 shadow-sm">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {isEdit && (
              <Input
                label="ID"
                value={form.id}
                readOnly
                onChange={() => {}}
                placeholder="例: spot-komoro-kaikoen"
                className="lg:col-span-2"
              />
            )}
            <div className="lg:col-span-2">
              <Input
                label="スポット名"
                value={form.name}
                onChange={setSpotName}
                error={errors.name}
                placeholder="例: 懐古園"
              />
              {!isEdit && (
                <p className="mt-2 text-xs text-[#64748b]">
                  {lookingUpPlace
                    ? "スポット名から情報を取得中…"
                    : placeLookupMiss
                      ? "該当するスポットが見つかりませんでした。住所を直接入力してください。"
                      : "スポット名を入力すると住所・座標などを自動入力します。"}
                </p>
              )}
            </div>
            <Input
              label="参考価格（円）"
              type="number"
              value={form.price}
              onChange={(v) => setField("price", v)}
              placeholder="例: 1500（無料の場合は 0）"
              className="lg:col-span-2"
            />
            <div className="lg:col-span-2">
              <Textarea
                label="説明"
                value={form.description}
                onChange={(v) => setField("description", v)}
                error={errors.description}
                placeholder="例: 小諸城址の公園。紅葉の名所として知られ、春には桜、秋には紅葉が楽しめます。"
                hint="AI 蘊蓄生成の元データになります。正確な情報を入力してください。"
              />
            </div>
            <fieldset className="lg:col-span-2">
              <legend className="text-sm font-medium text-[#0f172a]">カテゴリ</legend>
              <p className="mt-1 text-xs text-[#64748b]">
                最大 {MAX_SPOT_CATEGORIES} 件まで選択できます（{form.categories.length}/
                {MAX_SPOT_CATEGORIES}）
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1 text-xs font-medium text-[#475569]"
                  >
                    {cat}
                    <button
                      type="button"
                      aria-label={`${cat} を削除`}
                      onClick={() =>
                        setField(
                          "categories",
                          form.categories.filter((c) => c !== cat),
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              {selectableCategories.length > 0 && form.categories.length < MAX_SPOT_CATEGORIES && (
                <div className="mt-3">
                  <p className="text-xs text-[#64748b]">カテゴリを追加</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectableCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => addCategoryFromValue(cat)}
                        className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1 text-xs text-[#475569] transition hover:border-[#2563eb] hover:bg-[#eff6ff] hover:text-[#2563eb]"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
            <Input
              label="住所"
              value={form.address}
              onChange={setAddress}
              placeholder="例: 長野県小諸市中央1丁目"
              className="lg:col-span-2"
            />
            <Input
              label="エリア"
              value={form.area}
              onChange={setAreaField}
              placeholder="例: 小諸市"
              className="lg:col-span-2"
            />
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Input
                  label="緯度"
                  type="number"
                  value={form.lat}
                  onChange={(v) => setCoordField("lat", v)}
                  placeholder="例: 36.325"
                />
                <Input
                  label="経度"
                  type="number"
                  value={form.lon}
                  onChange={(v) => setCoordField("lon", v)}
                  placeholder="例: 138.425"
                />
              </div>
              <p className="mt-2 text-xs text-[#64748b]">
                {geocoding
                  ? "住所から座標を取得中…"
                  : "住所入力で自動取得されます。必要に応じて手動で編集できます。"}
              </p>
            </div>
            <MapPreview
              lat={mapLat}
              lon={mapLon}
              onLocationSelect={handleMapLocationSelect}
              className="lg:col-span-2"
            />
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#e2e8f0] pt-6">
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

      <Modal
        open={showDelete}
        title="スポットを削除しますか？"
        onClose={() => setShowDelete(false)}
      >
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
    </AdminShell>
  );
}

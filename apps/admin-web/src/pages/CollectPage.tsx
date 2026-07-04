import { CheckSquare, Loader2, MapPin, Pencil, Search, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { bulkImportSpots, geocodeAddress, listSpots } from "../api.ts";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Toast } from "../components/ui/Modal.tsx";
import { MUNICIPALITY } from "../master/index.ts";

/** 担当エリア内での絞り込みテーマの候補（ワンタップで入力に反映）。 */
const THEME_SUGGESTIONS = [
  "紅葉",
  "桜・花の名所",
  "神社仏閣・城跡",
  "自然・絶景",
  "子連れ向け",
  "穴場",
];

type CollectedSpot = {
  name: string;
  description: string;
  category: string;
  area: string;
  prefecture: string;
  address: string;
  tags: string[];
  sources: string[];
  /** 収集直後にジオコーディングして付与する緯度経度（取得できなければ undefined）。 */
  location?: { lat: number; lon: number };
  selected: boolean;
};

type Step = "input" | "collecting" | "preview" | "registering" | "done";

// vite の dev proxy（/agent → agentサービス）経由。同一オリジンなのでCORS不要。
const AGENT_URL = "/agent";

const CATEGORY_STYLES: Record<string, string> = {
  観光: "bg-blue-100 text-blue-800",
  自然: "bg-green-100 text-green-800",
  歴史: "bg-amber-100 text-amber-800",
};

/** 表記ゆれを吸収した名前照合キー（agent側 normalizeSpotName と同じ規則）。 */
function nameKey(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
}

/** 指定エリアの登録済みスポット名を取得する（重複収集・二重登録の防止用）。 */
async function fetchExistingNames(municipality: string): Promise<string[]> {
  const res = await listSpots({ limit: 1000 });
  return res.spots
    .filter((s) => !s.area || s.area === municipality)
    .map((s) => s.name);
}

export default function CollectPage() {
  // 担当エリアはログイン自治体に固定（都道府県・市区町村は選ばせない）。
  const prefecture = MUNICIPALITY.prefecture;
  const municipality = MUNICIPALITY.name;
  // テーマ・観点で担当エリア内をさらに絞り込む（任意）。
  const [theme, setTheme] = useState("");
  const [targetCount, setTargetCount] = useState(30);
  const [step, setStep] = useState<Step>("input");
  const [spots, setSpots] = useState<CollectedSpot[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // インライン編集中のスポット（spots 配列のインデックス）。null なら非編集。
  const [editing, setEditing] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number } | null>(null);

  const selectedCount = spots.filter((s) => s.selected).length;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of spots) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return [...counts.entries()];
  }, [spots]);

  // 絞り込み表示（spots 配列の元インデックス付き。編集・トグルは元配列を更新する）。
  const visibleSpots = useMemo(
    () =>
      spots
        .map((spot, index) => ({ spot, index }))
        .filter(({ spot }) => !categoryFilter || spot.category === categoryFilter),
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

  /** 緯度・経度の手動編集。両方空なら座標なし（location を外す）扱いにする。 */
  const updateSpotLocation = (index: number, field: "lat" | "lon", raw: string) => {
    setSpots(
      spots.map((s, i) => {
        if (i !== index) return s;
        const current = s.location ?? { lat: 0, lon: 0 };
        const next = { ...current, [field]: raw === "" ? 0 : Number(raw) };
        return { ...s, location: next.lat === 0 && next.lon === 0 ? undefined : next };
      }),
    );
  };

  const handleCollect = async () => {
    setStep("collecting");
    try {
      const excludeNames = await fetchExistingNames(municipality);
      const res = await fetch(`${AGENT_URL}/v1/collect-spots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipality,
          prefecture,
          targetCount,
          theme: theme.trim() || undefined,
          excludeNames,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        spots: Omit<CollectedSpot, "selected">[];
      };
      if (data.spots.length === 0) {
        const trimmedTheme = theme.trim();
        setToast(
          trimmedTheme
            ? `「${trimmedTheme}」に当てはまるスポットが見つかりませんでした。テーマを変えてお試しください`
            : excludeNames.length > 0
              ? "新しいスポットは見つかりませんでした（登録済みのスポットは除外されます）"
              : "スポットが見つかりませんでした。少し時間をおいて再度お試しください",
        );
        setStep("input");
        return;
      }
      // 収集直後に各スポットをジオコーディングして緯度経度を付与する（プレビューに表示し、
      // そのまま登録に使う）。観光地は「名前＋地域」の方が座標が当たりやすく、
      // 取れなければ住所でフォールバックする。
      const withLocation = await Promise.all(
        data.spots.map(async (s) => {
          const location =
            (await geocodeAddress(`${s.name} ${s.prefecture}${s.area}`)) ??
            (s.address ? await geocodeAddress(s.address) : null);
          return { ...s, selected: true, location: location ?? undefined };
        }),
      );
      setSpots(withLocation);
      setCategoryFilter(null);
      setEditing(null);
      setStep("preview");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "収集に失敗しました");
      setStep("input");
    }
  };

  const handleRegister = async () => {
    const selected = spots.filter((s) => s.selected);
    if (selected.length === 0) {
      setToast("登録するスポットを選択してください");
      return;
    }
    setStep("registering");
    try {
      // 収集中に他の経路で登録された分も含め、直前の最新状態で二重登録を防ぐ
      const existingKeys = new Set(
        (await fetchExistingNames(municipality)).map(nameKey),
      );
      const newSpots = selected.filter((s) => !existingKeys.has(nameKey(s.name)));
      if (newSpots.length === 0) {
        setToast("選択したスポットはすべて登録済みです");
        setStep("preview");
        return;
      }
      // 座標は収集時に付与済み（プレビューで確認・編集された値）をそのまま使う。
      const spotsToImport = newSpots.map((s) => ({
        id: crypto.randomUUID(),
        name: s.name,
        description: s.description,
        category: [s.category],
        area: s.area,
        prefecture: s.prefecture,
        address: s.address,
        tags: s.tags,
        ...(s.location ? { location: s.location } : {}),
      }));
      const res = await bulkImportSpots(spotsToImport);
      setResult({ ok: res.count });
      setStep("done");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "登録に失敗しました");
      setStep("preview");
    }
  };

  return (
    <AdminShell title="スポット管理">
      {step === "input" && (
        <div className="flex flex-col items-center px-6 pt-28">
          <div className="mb-3 flex items-center gap-3">
            <h1 className="text-[28px] font-bold tracking-tight text-[#0f172a]">スポット収集</h1>
          </div>
          <p className="mb-6 text-sm text-[#64748b]">
            Webから観光地を自動で集めて一覧にします
          </p>

          {/* 担当エリア（ログイン自治体に固定） */}
          <div className="mb-5 flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-4 py-1.5 text-sm font-semibold text-[#1e40af]">
            <MapPin className="size-4" strokeWidth={2} />
            {prefecture}
            <span className="text-[#93c5fd]">›</span>
            {municipality}
          </div>

          {/* テーマ・観点で絞り込み（任意） */}
          <div className="flex w-full max-w-[620px] items-center gap-1 rounded-full border border-[#e2e8f0] bg-white py-2 pl-5 pr-2 shadow-[0_1px_6px_rgba(32,33,36,0.15)] transition focus-within:shadow-[0_1px_10px_rgba(32,33,36,0.25)]">
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCollect();
              }}
              placeholder="テーマを入力"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              onClick={() => void handleCollect()}
              aria-label="収集開始"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#2563eb] text-white transition hover:bg-[#1d4ed8] active:scale-95"
            >
              <Search className="size-4.5" />
            </button>
          </div>

          {/* テーマ候補（ワンタップで入力に反映） */}
          <div className="mt-3 flex max-w-[620px] flex-wrap justify-center gap-2">
            {THEME_SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(theme === t ? "" : t)}
                className={`cursor-pointer rounded-full px-3 py-1 text-[13px] transition ${
                  theme === t
                    ? "bg-[#2563eb] font-medium text-white"
                    : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-[#64748b]">
            <span>目標件数</span>
            {[10, 30, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTargetCount(n)}
                className={`cursor-pointer rounded-full px-3 py-1 text-sm transition ${
                  targetCount === n
                    ? "bg-[#2563eb] font-medium text-white"
                    : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <p className="mt-8 text-xs text-[#94a3b8]">
            登録済みのスポットは自動で除外されます。収集結果は登録前に確認できます。
          </p>
        </div>
      )}

      {step === "collecting" && (
        <div className="flex flex-col items-center px-6 pt-36 text-center">
          <Loader2 className="size-10 animate-spin text-[#2563eb]" aria-hidden />
          <p className="mt-5 text-lg font-bold text-[#0f172a]">
            {municipality}
            {theme ? `の「${theme}」` : ""} を検索しています…
          </p>
          <p className="mt-2 text-sm text-[#64748b]">
            Webを検索してスポットを収集・要約しています（30秒〜2分）
          </p>
        </div>
      )}

      {(step === "preview" || step === "registering") && (
        <div className="mx-auto max-w-[760px] px-6 pb-28 pt-8">
          <p className="text-[13px] text-[#64748b]">
            {prefecture}
            {municipality} — 約 {spots.length} 件（登録済みスポットは除外済み）
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={`cursor-pointer rounded-full px-3 py-1 text-[13px] transition ${
                categoryFilter === null
                  ? "bg-[#0f172a] font-medium text-white"
                  : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
              }`}
            >
              すべて {spots.length}
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                className={`cursor-pointer rounded-full px-3 py-1 text-[13px] transition ${
                  categoryFilter === cat
                    ? "bg-[#0f172a] font-medium text-white"
                    : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                }`}
              >
                {cat} {count}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleAll}
              className="ml-auto cursor-pointer text-[13px] font-medium text-[#2563eb] hover:underline"
            >
              {visibleSpots.every(({ spot }) => spot.selected)
                ? "表示中をすべて解除"
                : "表示中をすべて選択"}
            </button>
          </div>

          <div className="mt-2">
            {visibleSpots.map(({ spot, index }) =>
              editing === index ? (
                <div
                  key={`edit-${index}`}
                  className="my-2 flex flex-col gap-2.5 rounded-xl border border-[#2563eb] bg-[#f8fafc] p-4"
                >
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={spot.name}
                      onChange={(e) => updateSpot(index, { name: e.target.value })}
                      placeholder="スポット名"
                      className="min-w-[200px] flex-1 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[14px] font-bold"
                    />
                    <select
                      value={spot.category}
                      onChange={(e) => updateSpot(index, { category: e.target.value })}
                      className="cursor-pointer rounded-lg border border-[#e2e8f0] bg-white px-2 py-2 text-sm"
                    >
                      {["観光", "自然", "歴史"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      step="any"
                      value={spot.location?.lat ?? ""}
                      onChange={(e) => updateSpotLocation(index, "lat", e.target.value)}
                      placeholder="緯度"
                      className="w-36 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      value={spot.location?.lon ?? ""}
                      onChange={(e) => updateSpotLocation(index, "lon", e.target.value)}
                      placeholder="経度"
                      className="w-36 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    value={spot.address}
                    onChange={(e) => updateSpot(index, { address: e.target.value })}
                    placeholder="住所"
                    className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    value={spot.description}
                    onChange={(e) => updateSpot(index, { description: e.target.value })}
                    placeholder="紹介文"
                    rows={3}
                    className="resize-y rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[13.5px] leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <Button onClick={() => setEditing(null)}>完了</Button>
                  </div>
                </div>
              ) : (
                <div
                  key={`row-${index}`}
                  className={`group flex w-full gap-3 border-b border-[#f1f5f9] py-4 transition hover:bg-[#f8fafc] ${
                    spot.selected ? "" : "opacity-45"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleOne(index)}
                    aria-label={spot.selected ? "選択を外す" : "選択する"}
                    className="mt-1 shrink-0 cursor-pointer"
                  >
                    {spot.selected ? (
                      <CheckSquare className="size-4.5 text-[#2563eb]" />
                    ) : (
                      <Square className="size-4.5 text-[#94a3b8]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleOne(index)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold leading-snug text-[#1e40af]">
                        {spot.name}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          CATEGORY_STYLES[spot.category] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {spot.category}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[#0d7d41]">{spot.address}</span>
                    {spot.location ? (
                      <span className="mt-0.5 block text-[11px] text-[#64748b]">
                        緯度 {spot.location.lat.toFixed(6)} ／ 経度 {spot.location.lon.toFixed(6)}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[11px] text-[#f59e0b]">
                        座標を取得できませんでした（編集で入力できます）
                      </span>
                    )}
                    <span className="mt-1 block text-[13.5px] leading-relaxed text-[#4b5563]">
                      {spot.description}
                    </span>
                    {spot.sources.length > 0 && (
                      <span className="mt-1 block text-[11px] text-[#94a3b8]">
                        出典: {spot.sources.join("、")}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(index)}
                    aria-label={`${spot.name} を編集`}
                    className="mt-1 h-8 w-8 shrink-0 cursor-pointer rounded-full text-[#94a3b8] opacity-0 transition hover:bg-[#e2e8f0] hover:text-[#2563eb] focus:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="mx-auto size-4" />
                  </button>
                </div>
              ),
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 border-t border-[#e2e8f0] bg-white/95 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-6">
              <p className="text-sm text-[#475569]">
                <span className="font-bold text-[#0f172a]">{selectedCount}</span> /{" "}
                {spots.length} 件を選択中
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep("input");
                    setSpots([]);
                    setEditing(null);
                  }}
                >
                  やめる
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
        <div className="flex flex-col items-center px-6 pt-36 text-center">
          <p className="text-lg font-bold text-[#0f172a]">登録完了</p>
          <p className="mt-2 text-sm text-[#475569]">
            {result.ok} 件のスポットを登録しました（Elasticsearchにも自動同期）
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setStep("input");
                setTheme("");
                setSpots([]);
                setResult(null);
              }}
            >
              続けて収集
            </Button>
            <Button onClick={() => (window.location.href = "/spots")}>スポット一覧へ</Button>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} variant="error" />}
    </AdminShell>
  );
}

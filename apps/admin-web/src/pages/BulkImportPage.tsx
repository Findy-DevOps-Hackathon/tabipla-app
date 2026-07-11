import { Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { bulkImportSpots } from "../api.ts";
import { Button } from "../components/ui/Button.tsx";
import { Toast } from "../components/ui/Modal.tsx";
import {
  type ImportDraft,
  type ImportRowDraft,
  useSpotAddDraft,
} from "../context/SpotAddDraftContext.tsx";
import { extractAreaFromAddress } from "../lib/address.ts";
import { isSpotCategory, parseCategories, SPOT_CATEGORIES } from "../lib/categories.ts";
import { parseCsvLine, stripBom } from "../lib/csv.ts";
import { CSV_HEADER, downloadCsvTemplate, parseHighlights } from "../lib/format.ts";
import { getFixedPrefecture } from "../master/index.ts";

type ParsedRow = ImportRowDraft;

function parseCsv(text: string): ParsedRow[] {
  const lines = stripBom(text).trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]?.trim();
  if (header !== CSV_HEADER) {
    throw new Error("CSV ヘッダーが不正です。テンプレートをダウンロードしてください。");
  }

  return lines.slice(1).map((line, index) => {
    if (!line.trim()) {
      return { line: index + 2, name: "", description: "", error: "空行です" };
    }
    const cols = parseCsvLine(line);
    const [name, category, _area, prefecture, address, description, highlights] = cols;
    const row: ParsedRow = {
      line: index + 2,
      name: name?.trim() ?? "",
      description: description?.trim() ?? "",
    };
    const categoryValue = category?.trim() ?? "";
    const addressValue = address?.trim() ?? "";
    const highlightsValue = highlights?.trim() ?? "";
    const missing: string[] = [];
    if (!row.name) missing.push("name");
    if (!categoryValue) missing.push("category");
    if (!addressValue) missing.push("address");
    if (!row.description) missing.push("description");
    if (!highlightsValue) missing.push("highlights");
    if (missing.length > 0) {
      row.error = `${missing.join(" / ")} が未入力です`;
      return row;
    }
    row.highlights = parseHighlights(highlightsValue);
    const cats = parseCategories(categoryValue);
    const invalid = cats.filter((c) => !isSpotCategory(c));
    if (invalid.length > 0) {
      row.error = `不正なカテゴリ: ${invalid.join(", ")}（${SPOT_CATEGORIES.join(" / ")} のみ）`;
      return row;
    }
    row.category = cats;
    const fixedPrefecture = getFixedPrefecture();
    if (prefecture?.trim() && prefecture.trim() !== fixedPrefecture) {
      row.error = `都道府県は ${fixedPrefecture} のみ取り込み可能です`;
      return row;
    }
    row.prefecture = fixedPrefecture;
    row.address = addressValue;
    row.area = extractAreaFromAddress(row.address, fixedPrefecture);
    return row;
  });
}

export default function BulkImportPage() {
  const navigate = useNavigate();
  const { importDraft, setImportDraft, setDataOperationBusy } = useSpotAddDraft();
  const { step, rows, result } = importDraft;

  const patchImport = (patch: Partial<ImportDraft>) => {
    setImportDraft((prev) => ({ ...prev, ...patch }));
  };

  const [toast, setToast] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setDataOperationBusy(importing);
    return () => setDataOperationBusy(false);
  }, [importing, setDataOperationBusy]);

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      patchImport({ rows: parsed, step: 2 });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "ファイルの読み込みに失敗しました");
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await bulkImportSpots(
        validRows.map(({ line: _line, error: _error, ...spot }) => ({
          ...spot,
          id: crypto.randomUUID(),
        })),
      );
      patchImport({ result: { ok: res.count, ng: errorRows.length }, step: 3 });
    } catch {
      setToast("取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    downloadCsvTemplate(getFixedPrefecture());
  };

  return (
    <>
      <div className="px-8">
        <div className="mb-8 flex items-center justify-center gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span
                className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                  importing && n === 3
                    ? "bg-[#2563eb] text-white"
                    : step >= n
                      ? "bg-[#2563eb] text-white"
                      : "bg-[#e2e8f0] text-[#64748b]"
                } ${importing && n === 3 ? "animate-pulse" : ""}`}
              >
                {importing && n === 3 ? <Loader2 className="size-4 animate-spin" aria-hidden /> : n}
              </span>
              <span className="text-sm text-[#475569]">
                {n === 1
                  ? "ファイル選択"
                  : n === 2
                    ? "プレビュー"
                    : importing
                      ? "取り込み中"
                      : "結果"}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="mx-auto w-full pb-8">
            <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-[#cbd5e1] bg-white/20 px-6 py-16 transition hover:border-[#2563eb]">
              <Upload className="mb-4 size-10 text-[#94a3b8]" />
              <p className="font-medium text-[#0f172a]">
                ファイルをドラッグ＆ドロップ、またはクリックして選択
              </p>
              <p className="mt-2 text-sm text-[#64748b]">UTF-8 CSV</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-4 cursor-pointer text-sm font-medium text-[#2563eb] hover:underline"
            >
              CSV テンプレートをダウンロード
            </button>
          </div>
        )}

        {importing && (
          <div className="rounded-xl border border-[#e2e8f0] bg-white px-6 py-20 text-center">
            <Loader2 className="mx-auto size-10 animate-spin text-[#2563eb]" aria-hidden />
            <p className="mt-4 text-lg font-bold text-[#0f172a]">取り込み中…</p>
            <p className="mt-2 text-sm text-[#64748b]">
              {validRows.length} 件の観光地を登録しています。しばらくお待ちください。
            </p>
          </div>
        )}

        {step === 2 && !importing && (
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-6">
            <p className="mb-4 text-sm text-[#475569]">
              取り込み予定 {validRows.length} 件 / エラー {errorRows.length} 件
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-[#e2e8f0]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f1f6fb] text-[13px] font-bold text-[#475569]">
                  <tr>
                    <th className="px-4 py-2">行</th>
                    <th className="px-4 py-2">名前</th>
                    <th className="px-4 py-2">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.line}
                      className={row.error ? "bg-[#fef2f2]" : "border-t border-[#e2e8f0]"}
                    >
                      <td className="px-4 py-2">{row.line}</td>
                      <td className="px-4 py-2">{row.name}</td>
                      <td className="px-4 py-2 text-[#dc2626]">{row.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                disabled={importing}
                onClick={() => patchImport({ step: 1 })}
              >
                戻る
              </Button>
              <Button
                disabled={validRows.length === 0 || importing}
                onClick={() => void handleImport()}
              >
                {importing ? "取り込み中…" : "取り込みを実行"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center">
            <p className="text-lg font-bold text-[#0f172a]">取り込み完了</p>
            <p className="mt-2 text-sm text-[#475569]">
              成功 {result.ok} 件 / 失敗 {result.ng} 件
            </p>
            <Button className="mt-6" onClick={() => navigate("/spots")}>
              観光地管理へ
            </Button>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} variant="error" onClose={() => setToast(null)} />}
    </>
  );
}

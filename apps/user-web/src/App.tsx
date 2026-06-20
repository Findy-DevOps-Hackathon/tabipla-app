import { useEffect, useRef, useState } from "react";
import { searchSpots } from "./api.ts";
import { SpotCard } from "./components/SpotCard.tsx";
import type { SearchMode, SearchResult } from "./types.ts";

/** 入力文字列のデバウンス時間（ms）。連続入力中の過剰リクエストを抑える。 */
const DEBOUNCE_MS = 300;

const SEARCH_MODES: Array<{ value: SearchMode; label: string; hint: string }> = [
  {
    value: "keyword",
    label: "キーワード",
    hint: "名前・説明文の全文一致",
  },
  {
    value: "vector",
    label: "ベクトル",
    hint: "意味が近いスポットを探索",
  },
  {
    value: "hybrid",
    label: "ハイブリッド",
    hint: "キーワード + 意味の両方",
  },
];

type Status = "idle" | "loading" | "success" | "error";

export default function App() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // 直近のリクエストだけを採用するための AbortController 参照。
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const keyword = input.trim();
    if (keyword === "") {
      setStatus("idle");
      setResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      setHasSearched(true);

      searchSpots({
        query: keyword,
        mode,
        size: 30,
        signal: controller.signal,
      })
        .then((res) => {
          setResults(res.results);
          setStatus("success");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setErrorMessage(error instanceof Error ? error.message : "検索に失敗しました。");
          setStatus("error");
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [input, mode]);

  const activeMode = SEARCH_MODES.find((item) => item.value === mode);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex items-baseline gap-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">tabipla</h1>
            <span className="text-sm font-medium text-slate-400">スポットを探す</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            行きたい場所・キーワードを入力してください（例: 京都、寺、竹林）。
          </p>

          <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="検索モード">
            {SEARCH_MODES.map((item) => {
              const selected = mode === item.value;
              return (
                // biome-ignore lint/a11y/useSemanticElements: スタイル付きのモード切替 UI
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(item.value)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    selected
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {activeMode && <p className="mt-2 text-xs text-slate-400">{activeMode.hint}</p>}

          <div className="relative mt-5">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="キーワードで検索"
              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 text-base shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {status === "loading" && (
          <p className="py-16 text-center text-sm text-slate-400">検索中…</p>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
            {mode !== "keyword" && (
              <p className="mt-2 text-xs text-rose-600">
                ベクトル/ハイブリッド検索を使う前に、
                <code className="rounded bg-rose-100 px-1">
                  pnpm -C services/backend-api embed-spots
                </code>{" "}
                で embedding を投入してください。
              </p>
            )}
          </div>
        )}

        {status === "idle" && !hasSearched && (
          <p className="py-16 text-center text-sm text-slate-400">
            キーワードを入力すると検索結果が表示されます。
          </p>
        )}

        {status === "success" && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              {results.length > 0
                ? `${results.length} 件のスポットが見つかりました（${activeMode?.label ?? mode}）`
                : "該当するスポットが見つかりませんでした"}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((result) => (
                <SpotCard key={result.id} result={result} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

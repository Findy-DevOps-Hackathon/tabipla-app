import { useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { ChevronLeftIcon } from "../components/icons.tsx";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { useAutoResizeTextarea } from "../lib/useAutoResizeTextarea.ts";

const MEMORY_MAX = 200;
/** 6行相当の初期高さ（text-base × leading 1.6 + p-4） */
const MEMORY_TEXTAREA_MIN_HEIGHT = 186;
const MEMORY_TEXTAREA_MAX_HEIGHT = 240;

type MemoryScreenProps = {
  /** 戻る操作。 */
  onBack: () => void;
  /** 次へ進む。自由記述内容と時間枠を渡す。 */
  onContinue: (memory: string, timeBudget: string) => void;
};

/**
 * 新設フロー: あなたの思い出の旅行について自由記述を求める画面（任意）。
 * 診断完了後、目的地選択の後に表示される。
 */
export function MemoryScreen({ onBack, onContinue }: MemoryScreenProps) {
  const [memoryText, setMemoryText] = useState("");
  const [timeBudget, setTimeBudget] = useState("half");
  const memoryInputRef = useAutoResizeTextarea({
    minHeight: MEMORY_TEXTAREA_MIN_HEIGHT,
    maxHeight: MEMORY_TEXTAREA_MAX_HEIGHT,
  });

  const handleContinue = () => {
    onContinue(memoryText, timeBudget);
  };

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-(--page)">
      <GridBackdrop />

      {/* ヘッダー */}
      <div className="relative flex h-14 items-center justify-between px-4 pt-6 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[#475569] transition active:opacity-60"
        >
          <ChevronLeftIcon className="size-[18px]" />
          <span className="text-[14px]">戻る</span>
        </button>
        <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-extrabold text-transparent">
          tabipla
        </p>
        <div className="w-12" aria-hidden /> {/* バランス用ダミー */}
      </div>

      {/* メインコンテンツ */}
      <div className="relative flex flex-1 flex-col justify-center px-6 gap-6 py-4 pb-10">
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-[18px] tracking-wider font-extrabold text-[#0f172a]">
            あなたの求める観光を教えてください
          </h2>
        </div>

        {/* 自由記述テキストエリア */}
        <div className="flex flex-col gap-1.5 w-full">
          <textarea
            ref={memoryInputRef}
            value={memoryText}
            onChange={(e) => setMemoryText(e.target.value.slice(0, MEMORY_MAX))}
            maxLength={MEMORY_MAX}
            placeholder="例）建築を楽しむ旅行や、その土地の文化に触れる旅行がしたい。"
            rows={1}
            className="w-full resize-none overflow-hidden rounded-2xl border border-slate-200 p-4 text-base leading-[1.6] shadow-inner focus:border-teal-600 focus:outline-hidden focus:ring-1 focus:ring-teal-600 bg-white/90 placeholder:text-slate-400"
          />
          <p
            className={`text-[11px] text-right ${memoryText.length >= MEMORY_MAX ? "text-rose-400" : "text-slate-400"}`}
          >
            {memoryText.length} / {MEMORY_MAX} 文字
          </p>
        </div>

        {/* 時間予算選択トグル */}
        <div className="flex flex-col gap-2 w-full">
          <p className="text-[12px] font-bold text-slate-500 text-left pl-1">
            今回の旅の時間枠
          </p>
          <div className="grid grid-cols-3 gap-2 w-full">
            {[
              { id: "short", label: "スキマ時間に", desc: "1〜2時間" },
              { id: "half", label: "サクッと半日", desc: "3〜4時間" },
              { id: "1day", label: "のんびり丸一日", desc: "6〜8時間" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTimeBudget(opt.id)}
                className={`flex flex-col items-center justify-center rounded-2xl border p-3 transition active:scale-95 ${
                  timeBudget === opt.id
                    ? "border-teal-600 bg-teal-50/40 text-teal-950 font-bold ring-1 ring-teal-600 shadow-xs"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="text-[13px]">{opt.label}</span>
                <span className="text-[10px] text-slate-400 font-normal mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 下部アクションボタンエリア */}
      <div className="relative flex flex-col gap-4 border-t border-slate-100 px-6 pb-8 pt-4 shrink-0">
        <button
          type="button"
          onClick={handleContinue}
          className={`${PRIMARY_BUTTON} h-16 tracking-wider w-full text-[15px] font-bold shadow-lg shadow-teal-500/20  hover:bg-teal-700 active:scale-[0.99] transition`}
        >
          次へ進む
        </button>
      </div>
    </div>
  );
}

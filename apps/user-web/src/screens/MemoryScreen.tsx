import { useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { ChevronLeftIcon } from "../components/icons.tsx";
import { PRIMARY_BUTTON } from "../lib/ui.ts";

const MEMORY_MAX = 200;

type MemoryScreenProps = {
  /** 戻る操作。 */
  onBack: () => void;
  /** 次へ進む。自由記述内容を渡す。 */
  onContinue: (memory: string) => void;
};

/**
 * 新設フロー: あなたの思い出の旅行について自由記述を求める画面（任意）。
 * 診断完了後、目的地選択の後に表示される。
 */
export function MemoryScreen({ onBack, onContinue }: MemoryScreenProps) {
  const [memoryText, setMemoryText] = useState("");

  const handleContinue = () => {
    onContinue(memoryText);
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
        <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[16px] font-extrabold text-transparent">
          tabipla
        </p>
        <div className="w-12" aria-hidden /> {/* バランス用ダミー */}
      </div>

      {/* メインコンテンツ */}
      <div className="relative flex flex-1 flex-col justify-center px-6 gap-6 py-4">
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-[18px] tracking-wider font-extrabold text-[#0f172a]">
            あなたの求める観光を教えてください
          </h2>
        </div>

        {/* 自由記述テキストエリア */}
        <div className="flex flex-col gap-1.5 w-full">
          <textarea
            value={memoryText}
            onChange={(e) => setMemoryText(e.target.value.slice(0, MEMORY_MAX))}
            maxLength={MEMORY_MAX}
            placeholder="例）建築を楽しむ旅行や、その土地の文化に触れる旅行がしたい。"
            rows={6}
            className="w-full rounded-2xl border border-slate-200 p-4 text-base leading-[1.6] shadow-inner focus:border-teal-600 focus:outline-hidden focus:ring-1 focus:ring-teal-600 bg-white/90 placeholder:text-slate-400"
          />
          <p
            className={`text-[11px] text-right ${memoryText.length >= MEMORY_MAX ? "text-rose-400" : "text-slate-400"}`}
          >
            {memoryText.length} / {MEMORY_MAX} 文字
          </p>
        </div>
      </div>

      {/* 下部アクションボタンエリア */}
      <div className="relative flex flex-col gap-4 border-t border-slate-100 bg-white px-6 pb-8 pt-4 shrink-0">
        <button
          type="button"
          onClick={handleContinue}
          className={`${PRIMARY_BUTTON} h-16 tracking-wider w-full text-[15px] font-bold shadow-md hover:bg-teal-700 active:scale-[0.99] transition`}
        >
          次へ進む
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { PRIMARY_BUTTON } from "../lib/ui.ts";

type MemoryScreenProps = {
  /** 戻る操作。 */
  onBack: () => void;
  /** ユーザー登録せずに進む。自由記述内容を渡す。 */
  onSkipRegister: (memory: string) => void;
  /** ユーザー登録して進む。自由記述内容を渡す。 */
  onGoRegister: (memory: string) => void;
};

/**
 * 新設フロー: あなたの思い出の旅行について自由記述を求める画面（任意）。
 * 診断完了後、目的地選択の後に表示される。
 */
export function MemoryScreen({ onBack, onSkipRegister, onGoRegister }: MemoryScreenProps) {
  const [memoryText, setMemoryText] = useState("");

  const handleSkip = () => {
    onSkipRegister(memoryText);
  };

  const handleRegister = () => {
    onGoRegister(memoryText);
  };

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-(--page)">
      <GridBackdrop />

      {/* ヘッダー */}
      <div className="relative flex h-14 items-center justify-between px-4 pt-6 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 items-center justify-center rounded-full bg-slate-100/80 px-3 text-[12px] font-bold text-[#475569] shadow-2xs active:scale-95 transition"
        >
          ← 戻る
        </button>
        <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[16px] font-extrabold text-transparent">
          tabipla
        </p>
        <div className="w-12" aria-hidden /> {/* バランス用ダミー */}
      </div>

      {/* メインコンテンツ */}
      <div className="relative flex flex-1 flex-col justify-center px-6 gap-6 py-4">
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-[20px] font-extrabold text-[#0f172a] tracking-tight">思い出の旅行を教えてください</h2>
          <p className="text-[13px] leading-[1.6] text-[#64748b] max-w-[320px] mx-auto">
            過去の旅行で楽しかった体験や心に残っている場所などを教えてください（任意）。
          </p>
        </div>

        {/* 自由記述テキストエリア */}
        <div className="flex flex-col gap-1.5 w-full">
          <textarea
            value={memoryText}
            onChange={(e) => setMemoryText(e.target.value)}
            placeholder="例）京都の嵐山で竹林の小径をゆっくり歩いたことや、温泉街で浴衣を着て外湯巡りをしたのが楽しかったです。のんびり静かに歴史を感じられる場所が好きです。"
            rows={6}
            className="w-full rounded-2xl border border-slate-200 p-4 text-[14px] leading-[1.6] shadow-inner focus:border-teal-600 focus:outline-hidden focus:ring-1 focus:ring-teal-600 bg-white/90 placeholder:text-slate-400"
          />
          <p className="text-[11px] text-right text-slate-400">
            {memoryText.length} 文字
          </p>
        </div>
      </div>

      {/* 下部アクションボタンエリア */}
      <div className="relative flex flex-col gap-4 border-t border-slate-100 bg-white px-6 pb-8 pt-4 shrink-0">
        <div className="flex gap-4 items-stretch">
          {/* 左：ユーザー登録せずに進む */}
          <div className="flex flex-1 flex-col gap-1.5 justify-between">
            <button
              type="button"
              onClick={handleSkip}
              className="flex h-12 w-full items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[13px] font-bold text-[#475569] hover:bg-slate-100 active:scale-[0.99] transition shadow-2xs"
            >
              登録せずに進む
            </button>
            <p className="text-[9px] leading-[1.4] text-slate-400 text-center px-1">
              ※登録しない場合、次回アプリ起動時に診断結果やチャット履歴は残りません
            </p>
          </div>

          {/* 右：ユーザー登録へ進む */}
          <div className="flex-1">
            <button
              type="button"
              onClick={handleRegister}
              className={`${PRIMARY_BUTTON} h-12 w-full text-[13px] font-bold shadow-md hover:bg-teal-700 active:scale-[0.99] transition`}
            >
              ユーザー登録へ進む
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

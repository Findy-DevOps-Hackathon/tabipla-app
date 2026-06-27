import { useEffect, useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { PREFERENCE_TAGS } from "../data/spots.ts";

type ProcessingScreenProps = {
  /** スワイプした件数（本文に表示）。 */
  count: number;
  /** 分析完了時。 */
  onDone: () => void;
};

/** 分析にかける擬似的な所要時間（ms）。 */
const ANALYZE_MS = 2400;

/** フロー 4: 好みを分析中であることを示す画面（ai-processing）。 */
export function ProcessingScreen({ count, onDone }: ProcessingScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setProgress(100));
    const timer = window.setTimeout(onDone, ANALYZE_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-(--page)">
      <GridBackdrop />

      <div className="relative flex h-14 items-center justify-center pt-6">
        <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[16px] font-extrabold text-transparent">
          tabipla
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-8 px-4">
        <div className="relative flex size-[100px] items-center justify-center">
          <div className="size-16 animate-spin rounded-full border-4 border-(--ai-bg) border-t-(--ai-fg)" />
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-[18px] font-semibold text-[#0f172a]">あなたの好みを分析中…</p>
          <p className="text-center text-[14px] leading-[1.6] text-[#64748b]">
            スワイプした {count} 件のスポットをもとに
            <br />
            あなたにぴったりの旅先を探しています。
          </p>
        </div>

        <div className="flex gap-2">
          {PREFERENCE_TAGS.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-[#e2e8f0] px-2 py-1 text-[12px] text-[#475569]"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-1 w-full bg-[#e2e8f0]">
        <div
          className="h-full bg-(--ai-fg) transition-[width] ease-out"
          style={{ width: `${progress}%`, transitionDuration: `${ANALYZE_MS}ms` }}
        />
      </div>
    </div>
  );
}

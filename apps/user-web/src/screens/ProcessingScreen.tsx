import { useEffect, useState } from "react";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { PREFERENCE_TAGS } from "../data/spots.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";

type ProcessingScreenProps = {
  /** スワイプした件数（本文に表示）。 */
  count: number;
  /** 分析完了時。 */
  onDone: () => void;
  /** APIフェッチが完了したか */
  isFetchDone?: boolean;
  /** APIエラーメッセージ */
  apiError?: string | null;
  /** エラー発生時のやり直し処理 */
  onRestart?: () => void;
};

/** フロー 4: 好みを分析中であることを示す画面（ai-processing）。 */
export function ProcessingScreen({
  count,
  onDone,
  isFetchDone = false,
  apiError = null,
  onRestart,
}: ProcessingScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (apiError) return;
    // 擬似的に 95% まで徐々に進行させる
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(timer);
          return 95;
        }
        return prev + 5;
      });
    }, 150);

    return () => clearInterval(timer);
  }, [apiError]);

  useEffect(() => {
    if (isFetchDone && !apiError) {
      setProgress(100);
      const timer = setTimeout(onDone, 600);
      return () => clearTimeout(timer);
    }
  }, [isFetchDone, apiError, onDone]);

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-(--page)">
      <GridBackdrop />

      <div className="relative flex h-14 items-center justify-center pt-6">
        <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[16px] font-extrabold text-transparent">
          tabipla
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-8 px-4">
        {apiError ? (
          // エラー表示
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="relative flex size-[80px] items-center justify-center rounded-full bg-red-50 text-red-500 text-[32px]">
              ⚠️
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-[18px] font-semibold text-red-600">プラン生成エラー</p>
              <p className="text-[14px] leading-[1.6] text-[#64748b] max-w-[280px]">{apiError}</p>
            </div>
            {onRestart && (
              <button
                type="button"
                onClick={onRestart}
                className={`${PRIMARY_BUTTON} px-6 py-2.5 text-[14px]`}
              >
                最初からやり直す
              </button>
            )}
          </div>
        ) : (
          // ローディング表示
          <>
            <div className="relative flex size-[100px] items-center justify-center">
              <div className="size-16 animate-spin rounded-full border-4 border-(--ai-bg) border-t-(--ai-fg)" />
            </div>

            <div className="flex flex-col items-center gap-3">
              <p className="text-[18px] font-semibold text-[#0f172a]">
                AIエージェントがディベート中…
              </p>
              <p className="text-center text-[14px] leading-[1.6] text-[#64748b]">
                スワイプした {count} 件のスポットをもとに
                <br />
                最適なプランを合意形成しています。
              </p>
            </div>
          </>
        )}

        {!apiError && (
          <div className="flex gap-2">
            {PREFERENCE_TAGS.map((tag: string) => (
              <span
                key={tag}
                className="rounded-md bg-[#e2e8f0] px-2 py-1 text-[12px] text-[#475569]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="relative h-1 w-full bg-[#e2e8f0]">
        <div
          className="h-full bg-(--ai-fg) transition-[width] ease-out"
          style={{ width: `${progress}%`, transitionDuration: `200ms` }}
        />
      </div>
    </div>
  );
}

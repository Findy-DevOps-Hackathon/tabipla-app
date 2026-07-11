import { useEffect, useMemo, useState } from "react";
import { AiGuideAvatar } from "../components/AiGuideAvatar.tsx";
import { AiGuideSpeechBubble } from "../components/AiGuideSpeechBubble.tsx";
import { GridBackdrop } from "../components/GridBackdrop.tsx";
import { presentPlanError } from "../lib/planError.ts";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../lib/ui.ts";

type ProcessingScreenProps = {
  /** 好み比較の回数（自由記述テキストは含めない）。 */
  comparisonCount: number;
  /** 分析完了時。 */
  onDone: () => void;
  /** APIフェッチが完了したか */
  isFetchDone?: boolean;
  /** APIエラーメッセージ */
  apiError?: string | null;
  /** 好みが幅広く、追加の比較選択を促すか */
  needsRefinement?: boolean;
  /** 分析結果の説明文 */
  interpretationMessage?: string;
  /** 追加の好み診断へ進む */
  onRefineMore?: () => void;
  /** 同じ入力のまま再試行 */
  onRetry?: () => void;
  /** 好み診断からやり直す */
  onRestart?: () => void;
  /** 入力画面へ戻る */
  onGoBack?: () => void;
  /** 戻るボタンのラベル */
  goBackLabel?: string;
};

/** フロー 4: 好みを分析中であることを示す画面（ai-processing）。 */
export function ProcessingScreen({
  comparisonCount,
  onDone,
  isFetchDone = false,
  apiError = null,
  needsRefinement = false,
  interpretationMessage = "",
  onRefineMore,
  onRetry,
  onRestart,
  onGoBack,
  goBackLabel = "入力内容を変更する",
}: ProcessingScreenProps) {
  const [progress, setProgress] = useState(0);
  const showRefinePrompt = isFetchDone && !apiError && needsRefinement;
  const errorPresentation = useMemo(
    () => (apiError ? presentPlanError(apiError) : null),
    [apiError],
  );

  useEffect(() => {
    if (apiError || showRefinePrompt) return;
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
  }, [apiError, showRefinePrompt]);

  useEffect(() => {
    if (showRefinePrompt) {
      setProgress(100);
      return;
    }
    if (isFetchDone && !apiError) {
      setProgress(100);
      const timer = setTimeout(onDone, 600);
      return () => clearTimeout(timer);
    }
  }, [isFetchDone, apiError, onDone, showRefinePrompt]);

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-(--page)">
      <GridBackdrop />

      <div className="relative flex h-14 items-center justify-center pt-6">
        <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-extrabold text-transparent">
          tabipla
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-8 px-4">
        {errorPresentation ? (
          <div className="flex w-full max-w-[320px] flex-col items-center gap-6 text-center">
            <div className="relative flex size-[80px] items-center justify-center rounded-full bg-rose-50 text-[32px]">
              ⚠️
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-[18px] font-semibold text-[#0f172a]">{errorPresentation.title}</p>
              <p className="text-[14px] leading-[1.6] text-[#64748b]">
                {errorPresentation.message}
              </p>
              {errorPresentation.hint && (
                <p className="text-[12px] leading-[1.6] text-[#94a3b8]">{errorPresentation.hint}</p>
              )}
            </div>
            <div className="flex w-full flex-col gap-2.5">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className={`${PRIMARY_BUTTON} px-6 py-3 text-[14px]`}
                >
                  もう一度試す
                </button>
              )}
              {onGoBack && (
                <button
                  type="button"
                  onClick={onGoBack}
                  className={`${SECONDARY_BUTTON} px-6 py-3 text-[14px]`}
                >
                  {goBackLabel}
                </button>
              )}
              {onRestart && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="text-[13px] font-medium text-[#64748b] underline-offset-2 transition active:opacity-60"
                >
                  最初からやり直す
                </button>
              )}
            </div>
          </div>
        ) : showRefinePrompt ? (
          <div className="flex w-full max-w-[320px] flex-col items-center gap-6">
            <div className="flex w-full items-end gap-1">
              <AiGuideAvatar size={40} className="shrink-0" />
              <AiGuideSpeechBubble>
                <span className="text-[13px] leading-[1.6]">
                  {interpretationMessage ||
                    "もう少し選んでいただければ、胸が高鳴るようなおすすめだけに絞れます。"}
                </span>
              </AiGuideSpeechBubble>
            </div>
            <div className="flex w-full flex-col gap-2.5">
              {onRefineMore && (
                <button
                  type="button"
                  onClick={onRefineMore}
                  className={`${PRIMARY_BUTTON} px-6 py-3 text-[14px]`}
                >
                  もう少し選んで絞り込む
                </button>
              )}
              <button
                type="button"
                onClick={onDone}
                className={`${SECONDARY_BUTTON} px-6 py-3 text-[14px]`}
              >
                このままおすすめを見る
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative flex size-[100px] items-center justify-center">
              <div className="size-16 animate-spin rounded-full border-4 border-(--ai-bg) border-t-(--ai-fg)" />
            </div>

            <div className="flex flex-col items-center gap-3">
              <p className="text-[18px] font-semibold text-[#0f172a]">診断中…</p>
              <p className="text-center text-[16px] leading-[1.6] text-[#64748b]">
                {comparisonCount} 件をもとに
                <br />
                あなたに合うおすすめを選んでいます。
              </p>
            </div>
          </>
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

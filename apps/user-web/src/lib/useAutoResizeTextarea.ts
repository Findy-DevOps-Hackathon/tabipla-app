import { useLayoutEffect, useRef } from "react";

type AutoResizeOptions = {
  minHeight?: number;
  maxHeight?: number;
};

export function resizeTextarea(
  el: HTMLTextAreaElement | null,
  { minHeight = 24, maxHeight = 200 }: AutoResizeOptions = {},
) {
  if (!el) return;
  el.style.height = "auto";
  const next = Math.min(maxHeight, Math.max(minHeight, el.scrollHeight));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
}

/** 内容量に応じて textarea の高さを自動調整する。 */
export function useAutoResizeTextarea(options?: AutoResizeOptions) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const minHeight = options?.minHeight;
  const maxHeight = options?.maxHeight;

  useLayoutEffect(() => {
    resizeTextarea(ref.current, { minHeight, maxHeight });
  });

  return ref;
}

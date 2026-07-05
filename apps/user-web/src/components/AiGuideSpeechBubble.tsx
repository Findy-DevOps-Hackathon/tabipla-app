import type { ReactNode } from "react";

type AiGuideSpeechBubbleProps = {
  children: ReactNode;
  variant?: "default" | "error";
  className?: string;
};

/** AIガイド左配置用の吹き出し（キャラ側から三角のしっぽが出る） */
export function AiGuideSpeechBubble({
  children,
  variant = "default",
  className = "",
}: AiGuideSpeechBubbleProps) {
  const isError = variant === "error";

  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <span
        aria-hidden
        className={`absolute -left-1.5 bottom-3.5 size-0 border-y-[7px] border-y-transparent border-r-[9px] ${
          isError ? "border-r-rose-50" : "border-r-white"
        }`}
      />
      {isError && (
        <span
          aria-hidden
          className="absolute -left-2 bottom-[13px] size-0 border-y-[8px] border-y-transparent border-r-[10px] border-r-rose-100"
        />
      )}
      <div
        className={`flex flex-col gap-1.5 whitespace-pre-wrap rounded-2xl px-3 py-2 leading-relaxed ${
          isError
            ? "border border-rose-100 bg-rose-50 text-rose-600"
            : "bg-white text-(--ai-fg) shadow-sm ring-1 ring-[#e2e8f0]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

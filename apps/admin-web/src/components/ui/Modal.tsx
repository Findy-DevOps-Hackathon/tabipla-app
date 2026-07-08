import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
        >
          <X className="size-4" aria-hidden />
        </button>
        <h2 className="pr-10 text-lg font-bold text-[#0f172a]">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  variant = "success",
  onClose,
}: {
  message: string;
  variant?: "success" | "error" | "info";
  onClose: () => void;
}) {
  const colors =
    variant === "success"
      ? "border-[#10b981]/30 bg-[#f0fdf4] text-[#047857]"
      : variant === "error"
        ? "border-[#dc2626]/30 bg-[#fef2f2] text-[#b91c1c]"
        : "border-[#2563eb]/30 bg-[#eff6ff] text-[#1d4ed8]";
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${colors}`}
      role="status"
    >
      <span className="min-w-0 flex-1 leading-relaxed">{message}</span>
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 transition hover:bg-black/5 hover:opacity-100"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

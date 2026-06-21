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
        className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-[#0f172a]">{title}</h2>
        <div className="mt-4">{children}</div>
        <button
          type="button"
          aria-label="閉じる"
          className="absolute right-4 top-4 hidden"
          onClick={onClose}
        />
      </div>
    </div>
  );
}

export function Toast({
  message,
  variant = "success",
}: {
  message: string;
  variant?: "success" | "error" | "info";
}) {
  const colors =
    variant === "success"
      ? "border-[#10b981]/30 bg-[#f0fdf4] text-[#047857]"
      : variant === "error"
        ? "border-[#dc2626]/30 bg-[#fef2f2] text-[#b91c1c]"
        : "border-[#2563eb]/30 bg-[#eff6ff] text-[#1d4ed8]";
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-lg border px-4 py-3 text-sm shadow-lg ${colors}`}
    >
      {message}
    </div>
  );
}

import type { ReactNode } from "react";

type Props = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function TabButton({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer border-b-2 px-1 py-3 text-sm font-medium transition ${
        active
          ? "border-[#2563eb] text-[#2563eb]"
          : "border-transparent text-[#64748b] hover:text-[#0f172a]"
      }`}
    >
      {children}
    </button>
  );
}

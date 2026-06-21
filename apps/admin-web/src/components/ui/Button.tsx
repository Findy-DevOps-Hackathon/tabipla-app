import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
  secondary: "border border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc]",
  ghost: "text-[#2563eb] hover:bg-[#eff6ff]",
  danger: "bg-[#dc2626] text-white hover:bg-[#b91c1c]",
};

type Props = {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  onClick,
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

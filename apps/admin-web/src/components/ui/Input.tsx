import { useId } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  readOnly?: boolean;
  error?: string;
  className?: string;
  id?: string;
};

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly,
  error,
  className = "",
  id: idProp,
}: Props) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-[#0f172a]">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 rounded-lg border px-3 text-sm outline-none transition focus:ring-2 focus:ring-[#2563eb]/30 ${
          readOnly
            ? "cursor-not-allowed border-[#e2e8f0] bg-[#f1f6fb] text-[#64748b]"
            : error
              ? "border-[#dc2626] bg-white"
              : "border-[#e2e8f0] bg-white focus:border-[#2563eb]"
        }`}
      />
      {error && <p className="text-xs text-[#dc2626]">{error}</p>}
    </div>
  );
}

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

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  className = "",
  error,
  hint,
  maxLength,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  id?: string;
}) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={textareaId} className="text-sm font-medium text-[#0f172a]">
        {label}
      </label>
      <textarea
        id={textareaId}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 ${className} ${
          error ? "border-[#dc2626]" : "border-[#e2e8f0]"
        }`}
      />
      {hint && !error && <p className="text-xs text-[#64748b]">{hint}</p>}
      {error && <p className="text-xs text-[#dc2626]">{error}</p>}
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "選択してください",
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  id?: string;
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-[#0f172a]">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 cursor-pointer rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

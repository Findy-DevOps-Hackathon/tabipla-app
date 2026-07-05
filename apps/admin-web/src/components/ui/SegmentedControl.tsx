type Item<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  items: Item<T>[];
  className?: string;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  items,
  className = "",
}: Props<T>) {
  return (
    <div
      className={`inline-flex w-full overflow-hidden rounded-full border border-[#cbd5e1] bg-transparent ${className}`}
      role="tablist"
    >
      {items.map((item, index) => {
        const active = value === item.value;
        const isLast = index === items.length - 1;

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`flex-1 cursor-pointer px-4 py-2.5 text-sm transition ${
              !isLast ? "border-r border-[#e2e8f0]" : ""
            } ${
              active
                ? "bg-transparent font-bold  text-[#0f172a]"
                : "bg-white font-medium text-[#94a3b8] hover:text-[#64748b]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

import { AdminShell } from "../components/layout/AdminShell.tsx";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <AdminShell title={title}>
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-lg font-bold text-[#0f172a]">{title}</p>
        <p className="mt-2 max-w-md text-sm text-[#64748b]">この機能は Phase 2 で実装予定です。</p>
      </div>
    </AdminShell>
  );
}

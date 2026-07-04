import { Globe, LogOut, MapPin } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { logout } from "../../auth.ts";
import { MUNICIPALITY } from "../../master/index.ts";
import { AdminLogo } from "../AdminLogo.tsx";

const navItems = [
  { to: "/spots", label: "スポット管理", icon: MapPin, end: true },
  { to: "/spots/collect", label: "スポット収集", icon: Globe },
] as const;

export function Sidebar() {
  const navigate = useNavigate();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col justify-between overflow-hidden bg-[#0f172a] p-4 text-white">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-3 px-1">
          <AdminLogo width={32} height={32} />
          <div>
            <p className="text-lg font-bold leading-tight">tabipla</p>
            <p className="text-xs text-[#94a3b8]">管理画面</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white/5 p-3">
          <span className="text-sm">{MUNICIPALITY.name}</span>
        </div>
        <nav className="flex flex-col gap-1">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
            Menu
          </p>
          {navItems.map((item) => {
            const { to, label, icon: Icon } = item;
            const end = "end" in item ? item.end : undefined;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-white/10 font-medium text-white"
                      : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[#94a3b8] transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-[18px]" strokeWidth={1.75} />
          ログアウト
        </button>
      </div>
    </aside>
  );
}

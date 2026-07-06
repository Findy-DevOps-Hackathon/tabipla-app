import type { LucideIcon } from "lucide-react";
import { List, LogOut, MapPinPlus } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../../auth.ts";
import { getMunicipality } from "../../master/index.ts";
import { AdminLogo } from "../AdminLogo.tsx";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive?: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    to: "/spots",
    label: "観光地一覧",
    icon: List,
    isActive: (pathname) => pathname === "/spots" || /^\/spots\/[^/]+\/edit$/.test(pathname),
  },
  {
    to: "/spots/new",
    label: "観光地追加",
    icon: MapPinPlus,
    isActive: (pathname) => pathname.startsWith("/spots/new"),
  },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const municipality = getMunicipality();

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
          <span className="text-sm">{municipality.name}</span>
        </div>
        <nav className="flex flex-col gap-1">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
            Menu
          </p>
          {navItems.map(({ to, label, icon: Icon, isActive }) => {
            const active = isActive ? isActive(pathname) : pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/spots"}
                aria-current={active ? "page" : undefined}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>

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
    </aside>
  );
}

import { useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  ClockAlert,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PackagePlus,
  Pill,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { canAccessModule, NAV_ITEMS, type NavItem } from "../lib/rbac";
import type { ModuleId } from "../types/pharmacy";

const MODULE_ICONS: Record<ModuleId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  sales: ShoppingBag,
  prescriptions: ClipboardList,
  medicines: Pill,
  categories: FolderTree,
  suppliers: Truck,
  "medicine-suppliers": Activity,
  inventory: Boxes,
  "stock-in": PackagePlus,
  "stock-adjustment": SlidersHorizontal,
  expiration: ClockAlert,
  reports: BarChart3,
  users: Users,
  settings: Settings,
};

const GROUP_ORDER: NavItem["group"][] = [
  "Overview",
  "Operations",
  "Catalog & Supply",
  "Inventory",
  "System",
];

export function Layout({
  activeModule,
  onNavigate,
  children,
}: {
  activeModule: ModuleId;
  onNavigate: (mod: ModuleId) => void;
  children: ReactNode;
}) {
  const { profile, settings, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) =>
    canAccessModule(profile?.role, item.id)
  );
  const currentItem = NAV_ITEMS.find((i) => i.id === activeModule);

  const handleSelect = (mod: ModuleId) => {
    onNavigate(mod);
    setMobileOpen(false);
  };

  const SidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#111923] border-r border-slate-200 dark:border-slate-800">
      <div>
        {/* Brand Zone */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleSelect(visibleNav[0]?.id ?? "dashboard")}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-md"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              PharmaSys
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-9.5rem)]" aria-label="Primary">
          {GROUP_ORDER.map((groupName) => {
            const items = visibleNav.filter((item) => item.group === groupName);
            if (items.length === 0) return null;
            return (
              <div key={groupName}>
                <div className="px-2.5 mb-1.5 text-[11px] font-medium tracking-wide text-slate-400 dark:text-slate-500">
                  {groupName}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = MODULE_ICONS[item.id];
                    const isActive = item.id === activeModule;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors duration-150 whitespace-nowrap ${
                          isActive
                            ? "bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-medium"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive
                              ? "text-teal-600 dark:text-teal-400"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer User Strip */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0E151E]">
        <div className="flex items-center justify-between gap-2 px-1.5">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
              {profile?.full_name || profile?.email}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {profile?.role || "Unassigned"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md p-2 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F6F8F9] dark:bg-[#0B1117] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] h-full z-10">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Top Header Bar */}
        <header className="no-print sticky top-0 z-20 h-14 bg-white/90 dark:bg-[#111923]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm min-w-0"
            >
              <span className="hidden sm:inline text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                {settings.pharmacy_name}
              </span>
              <ChevronRight
                className="hidden sm:inline h-3.5 w-3.5 text-slate-400 shrink-0"
                aria-hidden="true"
              />
              <span className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentItem?.label ?? "Workspace"}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                resolvedTheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {resolvedTheme === "dark" ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  Trophy,
  Flame,
  User,
  ChevronLeft,
  LogOut,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui";
import { MarqueeTicker } from "@/components/MarqueeTicker";
import { useAuth } from "@/hooks/useAuth";

const sidebarNavItems = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/student/assignments", label: "My Assignments", icon: BookOpen },
  { to: "/student/submissions", label: "My Submissions", icon: CheckSquare },
  { to: "/student/results", label: "My Results", icon: Trophy },
  { to: "/student/progress", label: "My Progress", icon: Flame },
  { to: "/student/profile", label: "Profile", icon: User },
];

const bottomNavItems = [
  { to: "/student", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/student/assignments", label: "Tasks", icon: BookOpen },
  { to: "/student/leaderboard", label: "Rank", icon: Trophy },
  { to: "/student/profile", label: "Profile", icon: User },
];

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isSubmitPage = location.pathname.includes("/submit");

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  // Keyboard shortcut: Ctrl + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-[#FBFBFA] dark:bg-[#0B0F19] font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Desktop Sidebar (lg:flex, hidden on tablet and mobile) */}
      <aside
        className={`hidden flex-col border-r border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] py-5 lg:flex shrink-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] relative z-40 ${
          isCollapsed ? "w-16 px-2" : "w-64 px-4"
        }`}
      >
        {/* Sidebar Header */}
        <div className={`mb-6 flex items-center ${isCollapsed ? "flex-col gap-3 justify-center" : "justify-between px-2"}`}>
          {!isCollapsed ? (
            <div className="flex items-center gap-3 min-w-0">
              <Logo className="h-8 w-8 text-xs shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-zinc-900 dark:text-white tracking-tight truncate">
                  Asadbek Khasanov
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">Candidate Portal</p>
              </div>
            </div>
          ) : (
            <Logo className="h-8 w-8 text-xs shrink-0 mx-auto" />
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            title={isCollapsed ? "Expand Sidebar (Ctrl + B)" : "Collapse Sidebar (Ctrl + B)"}
            className={`p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 ${
              isCollapsed ? "mx-auto block" : "shrink-0 ml-1"
            }`}
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1">
          {sidebarNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                    isCollapsed ? "justify-center px-0" : "justify-start px-3 gap-3"
                  } ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25 font-semibold"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}

                {/* Floating Tooltip on Hover when Collapsed */}
                {isCollapsed && (
                  <span className="fixed ml-14 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-md shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div
          className={`mt-4 pt-4 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center ${
            isCollapsed ? "flex-col gap-3 justify-center" : "justify-between"
          }`}
        >
          {isCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => logout()}
                title="Logout"
                className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition active:scale-95 group relative"
              >
                <LogOut className="w-4 h-4" />
                <span className="fixed ml-12 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-md shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 whitespace-nowrap">
                  Logout
                </span>
              </button>
              <ThemeToggle />
            </>
          ) : (
            <>
              <button
                onClick={() => logout()}
                className="rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
              <ThemeToggle />
            </>
          )}
        </div>
      </aside>

      {/* Main Content Area: Viewport-Confined Container */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {/* Tablet & Mobile Header (lg:hidden) */}
        {!isSubmitPage && (
          <header className="flex h-16 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md px-4 sm:px-6 lg:hidden shrink-0 sticky top-0 z-30">
            <div className="flex items-center gap-2.5">
              <Logo className="h-7 w-7 text-xs" />
              <div>
                <span className="font-bold text-zinc-900 dark:text-white block leading-tight text-sm tracking-tight">
                  Asadbek Khasanov
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Candidate Portal</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <NavLink
                to="/student/profile"
                className="flex items-center active:scale-95 transition-transform"
                title="Profile"
              >
                <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                  {(user?.full_name?.charAt(0) || user?.email?.charAt(0) || "U").toUpperCase()}
                </div>
              </NavLink>
              <button
                type="button"
                onClick={() => logout()}
                className="p-2 rounded-xl text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition active:scale-95"
                title="Tizimdan chiqish (Logout)"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
        )}

        {/* Desktop Header (lg:flex) */}
        <header className="hidden items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md px-8 py-3.5 lg:flex shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Candidate Portal
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 font-mono">
              {user?.email}
            </span>
            <ThemeToggle />
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition shadow-xs active:scale-95"
              title="Sign out of your account"
            >
              <LogOut className="h-3.5 w-3.5 text-zinc-500" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Top Notice & Motivation Running Marquee */}
        {!isSubmitPage && (
          <div className="shrink-0">
            <MarqueeTicker />
          </div>
        )}

        {/* Content Container: ONLY this element scrolls vertically! */}
        <main
          className={`flex-1 overflow-y-auto overflow-x-hidden ${
            isSubmitPage ? "p-0 pb-0" : "p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8"
          } scrollbar-none`}
        >
          <Outlet />
        </main>
      </div>

      {/* Fixed Mobile Bottom App Bar (Native App Navigation) */}
      {!isSubmitPage && (
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 left-0 right-0 z-50 block lg:hidden bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800/80 px-2 py-1.5 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center justify-around w-full max-w-md mx-auto">
            {bottomNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-w-[56px] py-1 px-1 transition-all duration-150 active:scale-95 select-none ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={`p-1 rounded-xl transition ${
                        isActive ? "bg-indigo-50 dark:bg-indigo-950/50" : ""
                      }`}
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 1.75} />
                    </div>
                    <span className="text-[10px] leading-tight mt-0.5 tracking-tight truncate max-w-full">
                      {item.label}
                    </span>
                    {isActive && (
                      <span className="h-1 w-1 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5 animate-in zoom-in duration-150" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

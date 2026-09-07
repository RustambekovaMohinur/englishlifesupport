import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Grid3X3, FileText, CheckSquare, User } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const sidebarNavItems = [
  { to: "/teacher", label: "Dashboard", end: true },
  { to: "/teacher/students", label: "Students" },
  { to: "/teacher/groups", label: "Groups" },
  { to: "/teacher/assignments", label: "Assignments" },
  { to: "/teacher/submissions", label: "Submissions" },
  { to: "/teacher/profile", label: "Profile" },
];

const bottomNavItems = [
  { to: "/teacher", label: "Desk", icon: LayoutDashboard, end: true },
  { to: "/teacher/groups", label: "Matrix", icon: Grid3X3 },
  { to: "/teacher/assignments", label: "Tasks", icon: FileText },
  { to: "/teacher/submissions", label: "Review", icon: CheckSquare },
  { to: "/teacher/profile", label: "Profile", icon: User },
];

export default function TeacherLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#FBFBFA] dark:bg-[#0B0F19] font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Desktop Sidebar (lg:flex, hidden on tablet and mobile) */}
      <aside className="hidden w-64 flex-col border-r border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] px-4 py-6 lg:flex shrink-0">
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <p className="text-sm font-bold leading-tight text-zinc-900 dark:text-white tracking-tight">Asadbek Khasanov</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Examiner Desk</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {sidebarNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 font-semibold border border-brand-200 dark:border-brand-850"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
          <button
            onClick={() => logout()}
            className="rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition active:scale-95"
          >
            Logout
          </button>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Tablet & Mobile Header (lg:hidden) - Strictly: Brand Name, ThemeToggle, User Avatar */}
        <header className="flex h-16 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md px-4 sm:px-6 lg:hidden sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7 text-xs" />
            <div>
              <span className="font-bold text-zinc-900 dark:text-white block leading-tight text-sm tracking-tight">Asadbek Khasanov</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Examiner Desk</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <NavLink to="/teacher/profile" className="flex items-center active:scale-95 transition-transform" title="Teacher Profile">
              <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                {(user?.full_name?.charAt(0) || user?.email?.charAt(0) || "T").toUpperCase()}
              </div>
            </NavLink>
          </div>
        </header>

        {/* Desktop Header (lg:flex) */}
        <header className="hidden items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md px-8 py-4 lg:flex sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Examiner Desk / Teacher Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 font-mono">{user?.email}</span>
            <ThemeToggle />
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition shadow-xs active:scale-95"
              title="Sign out of your account"
            >
              <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </header>

        {/* Content Container: pb-24 on mobile/tablet to avoid bottom bar overlap, pb-8 on desktop */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Fixed Mobile Bottom App Bar (Native App Navigation) */}
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
                  <div className={`p-1 rounded-xl transition ${isActive ? "bg-indigo-50 dark:bg-indigo-950/50" : ""}`}>
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
    </div>
  );
}

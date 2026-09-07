import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Logo, ThemeToggle } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/teacher", label: "Dashboard", end: true },
  { to: "/teacher/students", label: "Students" },
  { to: "/teacher/groups", label: "Groups" },
  { to: "/teacher/assignments", label: "Assignments" },
  { to: "/teacher/submissions", label: "Submissions" },
  { to: "/teacher/profile", label: "Profile" },
];

export default function TeacherLayout() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#FBFBFA] dark:bg-[#0B0F19] font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] px-4 py-6 md:flex">
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
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
            className="rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition"
          >
            Logout
          </button>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex w-64 max-w-[80%] flex-col bg-white dark:bg-[#111827] p-6 shadow-2xl border-r border-zinc-200 dark:border-zinc-800">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Logo />
                <div>
                  <span className="font-bold text-zinc-900 dark:text-white block leading-tight">Asadbek Khasanov</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Examiner Desk</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
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
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 max-w-[140px]">{user?.email}</p>
                <ThemeToggle />
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
              >
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md px-4 md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <Logo className="h-7 w-7 text-xs" />
              <div>
                <span className="font-bold text-zinc-900 dark:text-white block leading-tight text-sm tracking-tight">Asadbek Khasanov</span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Examiner Desk</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => logout()}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white px-2 py-1"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md px-8 py-4 md:flex">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Examiner Desk / Teacher Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 font-mono">{user?.email}</span>
            <ThemeToggle />
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition shadow-xs"
              title="Sign out of your account"
            >
              <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

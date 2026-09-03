import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/student", label: "Dashboard", end: true },
  { to: "/student/assignments", label: "My Assignments" },
  { to: "/student/submissions", label: "My Submissions" },
  { to: "/student/results", label: "My Results" },
  { to: "/student/progress", label: "My Progress" },
  { to: "/student/profile", label: "Profile" },
];

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-neutral-100 bg-white px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Logo />
          <div>
            <p className="text-sm font-bold leading-tight text-neutral-900">Asadbek Khasanov</p>
            <p className="text-xs text-neutral-400">Student Panel</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-600 font-semibold" : "text-neutral-600 hover:bg-neutral-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => logout()}
          className="mt-4 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-500 hover:bg-neutral-50"
        >
          Logout
        </button>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex w-64 max-w-[80%] flex-col bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Logo />
                <span className="font-bold text-neutral-900">Asadbek Khasanov</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
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
                    `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive ? "bg-brand-50 text-brand-600 font-semibold" : "text-neutral-600 hover:bg-neutral-50"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-neutral-100 pt-4">
              <p className="mb-2 truncate text-xs text-neutral-500">{user?.email}</p>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
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
        <header className="flex h-16 items-center justify-between border-b border-neutral-100 bg-white px-4 md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50 focus:outline-none"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <Logo className="h-7 w-7 text-xs" />
              <span className="font-bold text-neutral-900">Asadbek Khasanov</span>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
          >
            Logout
          </button>
        </header>

        {/* Desktop Header */}
        <header className="hidden items-center justify-end border-b border-neutral-100 bg-white px-8 py-4 md:flex">
          <span className="text-sm text-neutral-500">{user?.email}</span>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "@/components/ui";
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

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="hidden w-64 flex-col border-r border-neutral-100 bg-white px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Logo />
          <div>
            <p className="text-sm font-bold leading-tight text-neutral-900">English Life</p>
            <p className="text-xs text-neutral-400">Teacher Panel</p>
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
                  isActive ? "bg-brand-50 text-brand-600" : "text-neutral-600 hover:bg-neutral-50"
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

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-100 bg-white px-6 py-4 md:hidden">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-bold">English Life</span>
          </div>
          <button onClick={() => logout()} className="text-sm font-medium text-neutral-500">
            Logout
          </button>
        </header>
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

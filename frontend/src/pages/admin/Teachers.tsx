import { FC, useEffect, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Plus,
  Shield,
  UserCheck,
  Mail,
  Lock,
  Phone,
  FileText,
  Search,
  User,
  CheckCircle2,
  LogOut,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

import { LoadingRows, Modal, ThemeToggle } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  createTeacherAccount,
  listAllTeachers,
  CreateTeacherPayload,
  TeacherItemOut,
} from "@/services/lmsService";
import { tokenStorage } from "@/services/api";

export default function AdminTeachersPortalPage() {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<TeacherItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const data = await listAllTeachers();
      setTeachers(data);
    } catch {
      toast.error("Failed to load teachers list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const handleAdminLogout = () => {
    localStorage.removeItem("el_admin_auth");
    localStorage.removeItem("el_admin_token");
    tokenStorage.clear();
    toast.success("Logged out of Super Admin Portal");
    navigate("/admin/login");
  };

  const handleCreateTeacher = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !username.trim() || !password) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateTeacherPayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
      };

      const created = await createTeacherAccount(payload);
      toast.success(`Teacher "${created.full_name}" registered successfully!`);
      setIsModalOpen(false);

      // Reset form
      setFirstName("");
      setLastName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setPhone("");
      setBio("");

      await loadTeachers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create teacher account");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTeachers = teachers.filter((t) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (t.full_name || "").toLowerCase().includes(q) ||
      (t.username || "").toLowerCase().includes(q) ||
      (t.email || "").toLowerCase().includes(q) ||
      (t.phone || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Super Admin Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-zinc-900 border-b border-zinc-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight">English Life</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Super Admin
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Master Examiner & Teacher Management Console</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-800/80 px-3 py-1.5 rounded-lg border border-zinc-700/60 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>admin2010</span>
            </span>

            <ThemeToggle />

            <button
              onClick={handleAdminLogout}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              <span>Teacher Roster & Multi-Tenant Management</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Register new teachers with real names and isolated cohort scopes. Each teacher manages only their own students.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Teacher</span>
          </button>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <span className="text-xs text-zinc-500 font-medium">Registered Teachers</span>
            <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mt-1 tabular-nums">
              {teachers.length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <span className="text-xs text-zinc-500 font-medium">Data Isolation</span>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>100% Strict Scoped</span>
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <span className="text-xs text-zinc-500 font-medium">Master Security</span>
            <p className="text-xs text-zinc-400 mt-2 font-mono">
              Restricted to admin2010
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher by real name, username, email, or phone..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>

        {/* Teachers Table */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-6">
              <LoadingRows rows={5} />
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <User className="w-10 h-10 mx-auto text-zinc-400 mb-2" />
              <p className="font-semibold text-sm">No teachers found</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {search ? "No matching teachers for your query." : "Click '+ Add New Teacher' to register the first teacher."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Teacher Name</th>
                    <th className="py-3 px-4">Username / Login</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Phone / Contact</th>
                    <th className="py-3 px-4">Registered Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {filteredTeachers.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={t.full_name}
                            src={t.avatar_url}
                            className="w-9 h-9 rounded-full shrink-0 border border-zinc-200 dark:border-zinc-700"
                          />
                          <div>
                            <span className="font-bold text-zinc-900 dark:text-white block">
                              {t.full_name}
                            </span>
                            {t.bio && (
                              <span className="text-[11px] text-zinc-400 line-clamp-1">
                                {t.bio}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                        @{t.username || "teacher"}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                        {t.email}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {t.phone || "—"}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-xs">
                        {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add New Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-8 relative">
            <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2 mb-1">
              <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Register New Teacher</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
              Create official login credentials. The teacher will manage only their assigned cohorts.
            </p>

            <form onSubmit={handleCreateTeacher} className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Asadbek"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Khasanov"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Login Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. asadbek_teacher"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Password *
                  </label>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 letter, 1 num"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Official Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@englishlife.uz"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Phone / Telegram (Optional)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998901234567 or @teacher_username"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Bio / Specialization (Optional)
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Senior IELTS Instructor · 8.5 Band Holder"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Registering..." : "Create Teacher Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

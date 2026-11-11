import { FC, useEffect, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  GraduationCap,
  Users,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  KeyRound,
  LogOut,
  Sparkles,
  RefreshCw,
  UserCheck,
  UserX,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

import { LoadingRows, Modal, ThemeToggle } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  getPlatformStats,
  getPendingApprovals,
  approveUserRequest,
  rejectUserRequest,
  resetTeacherPassword,
  toggleTeacherStatus,
  createTeacherAccount,
  listAllTeachers,
  PlatformStatsOut,
  PendingApprovalItem,
  TeacherItemOut,
  CreateTeacherPayload,
} from "@/services/lmsService";
import { tokenStorage } from "@/services/api";

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlatformStatsOut | null>(null);
  const [approvals, setApprovals] = useState<PendingApprovalItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "teachers" | "approvals">("overview");

  // Search filter
  const [teacherSearch, setTeacherSearch] = useState("");

  // Modals state
  const [isAddTeacherOpen, setIsAddTeacherOpen] = useState(false);
  const [isResetPwdOpen, setIsResetPwdOpen] = useState(false);
  const [targetTeacher, setTargetTeacher] = useState<TeacherItemOut | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // New Teacher Form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, approvalsData, teachersData] = await Promise.all([
        getPlatformStats().catch(() => null),
        getPendingApprovals().catch(() => []),
        listAllTeachers().catch(() => []),
      ]);
      setStats(statsData);
      setApprovals(approvalsData);
      setTeachers(teachersData);
    } catch {
      toast.error("Failed to load platform data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
      setIsAddTeacherOpen(false);
      setFirstName("");
      setLastName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setPhone("");
      setBio("");
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create teacher account");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetTeacher || !newPassword.trim()) return;

    setSubmitting(true);
    try {
      await resetTeacherPassword(targetTeacher.id, newPassword.trim());
      toast.success(`Password reset for ${targetTeacher.full_name}`);
      setIsResetPwdOpen(false);
      setNewPassword("");
      setTargetTeacher(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTeacher = async (teacher: TeacherItemOut) => {
    const nextStatus = !teacher.is_active;
    try {
      await toggleTeacherStatus(teacher.id, nextStatus);
      toast.success(`Teacher ${teacher.full_name} is now ${nextStatus ? "Active" : "Deactivated"}`);
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacher.id ? { ...t, is_active: nextStatus } : t))
      );
    } catch {
      toast.error("Failed to update teacher status");
    }
  };

  const handleApprove = async (item: PendingApprovalItem) => {
    try {
      await approveUserRequest(item.user_id);
      toast.success(`Approved ${item.full_name} (${item.role})`);
      setApprovals((prev) => prev.filter((a) => a.id !== item.id));
      if (stats) {
        setStats({
          ...stats,
          pending_approvals: Math.max(0, stats.pending_approvals - 1),
          active_students: item.role === "student" ? stats.active_students + 1 : stats.active_students,
        });
      }
    } catch {
      toast.error("Failed to approve user");
    }
  };

  const handleReject = async (item: PendingApprovalItem) => {
    try {
      await rejectUserRequest(item.user_id);
      toast.success(`Rejected ${item.full_name}`);
      setApprovals((prev) => prev.filter((a) => a.id !== item.id));
      if (stats) {
        setStats({ ...stats, pending_approvals: Math.max(0, stats.pending_approvals - 1) });
      }
    } catch {
      toast.error("Failed to reject user");
    }
  };

  const filteredTeachers = teachers.filter((t) => {
    const q = teacherSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (t.full_name || "").toLowerCase().includes(q) ||
      (t.username || "").toLowerCase().includes(q) ||
      (t.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      {/* Super Admin Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-zinc-900 border-b border-zinc-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight">English Life</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Super Admin
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Master Examiner & Multi-Tenant Control Center</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-800/80 px-3 py-1.5 rounded-lg border border-zinc-700/60 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>admin2010</span>
            </span>

            <button
              onClick={loadData}
              title="Refresh Data"
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>

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
        {/* Page Title & Quick Action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              <Shield className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              <span>Super Admin Command Center</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Platform-wide governance: manage teacher credentials, process incoming approval queues, and monitor tenant metrics.
            </p>
          </div>

          <button
            onClick={() => setIsAddTeacherOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Teacher</span>
          </button>
        </div>

        {/* Global Platform Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Teachers</span>
              <GraduationCap className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-black font-mono text-zinc-900 dark:text-white mt-2 tabular-nums">
              {stats?.total_teachers ?? teachers.length}
            </p>
            <span className="text-[11px] text-emerald-500 font-medium">Active Tenants</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Total Students</span>
              <Users className="w-4 h-4 text-sky-500" />
            </div>
            <p className="text-2xl font-black font-mono text-zinc-900 dark:text-white mt-2 tabular-nums">
              {stats?.total_students ?? 0}
            </p>
            <span className="text-[11px] text-zinc-400">
              {stats?.active_students ?? 0} Active Enrolled
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Cohorts / Groups</span>
              <Layers className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-black font-mono text-zinc-900 dark:text-white mt-2 tabular-nums">
              {stats?.total_groups ?? 0}
            </p>
            <span className="text-[11px] text-zinc-400">Isolated Scopes</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Submissions</span>
              <FileText className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-black font-mono text-zinc-900 dark:text-white mt-2 tabular-nums">
              {stats?.total_submissions ?? 0}
            </p>
            <span className="text-[11px] text-zinc-400">
              {stats?.total_assignments ?? 0} Tasks
            </span>
          </div>

          <div
            onClick={() => setActiveTab("approvals")}
            className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs cursor-pointer hover:border-amber-500/50 transition col-span-2 lg:col-span-1"
          >
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Pending Approvals</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-2 tabular-nums">
              {approvals.length}
            </p>
            <span className="text-[11px] text-amber-500 font-medium">Action Required →</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === "overview"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Platform Overview
          </button>
          <button
            onClick={() => setActiveTab("teachers")}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "teachers"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <span>Teacher Roster</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {teachers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("approvals")}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "approvals"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <span>Approval Queue</span>
            {approvals.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {approvals.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Platform Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Teacher Isolation & Allocation Matrix */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span>Multi-Teacher Tenant Distribution</span>
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Strict multi-tenancy: each teacher accesses only their own assigned cohorts and students.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("teachers")}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                >
                  <span>Manage Teachers</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {loading ? (
                <LoadingRows rows={3} />
              ) : teachers.length === 0 ? (
                <p className="text-xs text-zinc-500">No teachers found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teachers.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={t.full_name}
                            src={t.avatar_url}
                            className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-700"
                          />
                          <div>
                            <span className="font-bold text-sm text-zinc-900 dark:text-white block">
                              {t.full_name}
                            </span>
                            <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                              @{t.username}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.is_active
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                          }`}
                        >
                          {t.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60">
                        <div>
                          <span className="text-zinc-500 block text-[11px]">Cohorts</span>
                          <span className="font-bold font-mono text-zinc-900 dark:text-white">
                            {t.group_count ?? 0} Groups
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[11px]">Enrolled</span>
                          <span className="font-bold font-mono text-zinc-900 dark:text-white">
                            {t.student_count ?? 0} Students
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            setTargetTeacher(t);
                            setIsResetPwdOpen(true);
                          }}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-200/70 hover:bg-zinc-200 dark:bg-zinc-700/60 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Reset Password</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Pending Approvals Callout */}
            {approvals.length > 0 && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                      {approvals.length} Pending Enrollment Requests
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Students are waiting for authorization to join class cohorts.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("approvals")}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Review Queue
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Teacher Management */}
        {activeTab === "teachers" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="Search teacher by name, username, or email..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                onClick={() => setIsAddTeacherOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Teacher</span>
              </button>
            </div>

            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
              {loading ? (
                <div className="p-6">
                  <LoadingRows rows={5} />
                </div>
              ) : filteredTeachers.length === 0 ? (
                <div className="p-12 text-center text-zinc-500">
                  <GraduationCap className="w-10 h-10 mx-auto text-zinc-400 mb-2" />
                  <p className="font-semibold text-sm">No teachers registered</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Click "+ Add Teacher" to create an instructor account.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Instructor</th>
                        <th className="py-3 px-4">Username</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Cohorts / Students</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {filteredTeachers.map((t) => (
                        <tr key={t.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <UserAvatar
                                name={t.full_name}
                                src={t.avatar_url}
                                className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-700"
                              />
                              <div>
                                <span className="font-bold text-zinc-900 dark:text-white block">
                                  {t.full_name}
                                </span>
                                {t.phone && <span className="text-[11px] text-zinc-400">{t.phone}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                            @{t.username}
                          </td>
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">{t.email}</td>
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                            <span className="font-semibold text-zinc-900 dark:text-white font-mono">
                              {t.group_count ?? 0}
                            </span>{" "}
                            cohorts ·{" "}
                            <span className="font-semibold text-zinc-900 dark:text-white font-mono">
                              {t.student_count ?? 0}
                            </span>{" "}
                            students
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleTeacher(t)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase cursor-pointer transition ${
                                t.is_active
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-rose-500/10 hover:text-rose-600"
                                  : "bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-emerald-500/10 hover:text-emerald-600"
                              }`}
                            >
                              {t.is_active ? "Active" : "Disabled"}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setTargetTeacher(t);
                                setIsResetPwdOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold transition cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Reset Password</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Approval Queue */}
        {activeTab === "approvals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Pending Enrollment Requests
                </h2>
                <p className="text-xs text-zinc-500">
                  Authorize or reject incoming student/teacher onboarding submissions.
                </p>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {approvals.length} pending
              </span>
            </div>

            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
              {loading ? (
                <div className="p-6">
                  <LoadingRows rows={4} />
                </div>
              ) : approvals.length === 0 ? (
                <div className="p-12 text-center text-zinc-500">
                  <UserCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                  <p className="font-semibold text-sm">Approval Queue is Clear</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    No pending registration requests awaiting review.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Applicant</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Target Cohort</th>
                        <th className="py-3 px-4">Assigned Teacher</th>
                        <th className="py-3 px-4">Registered</th>
                        <th className="py-3 px-4 text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {approvals.map((item) => (
                        <tr key={item.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition">
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-bold text-zinc-900 dark:text-white block">
                                {item.full_name}
                              </span>
                              <span className="text-[11px] font-mono text-zinc-400">
                                @{item.username} · {item.email}
                              </span>
                              {item.phone && (
                                <span className="text-[11px] text-zinc-500 block">
                                  Telegram: {item.phone}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                              {item.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white">
                            {item.group_name || "—"}
                          </td>
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                            {item.teacher_name || "—"}
                          </td>
                          <td className="py-3 px-4 text-zinc-400 text-xs">
                            {item.created_at ? format(new Date(item.created_at), "MMM d, HH:mm") : "—"}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => handleApprove(item)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(item)}
                              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Add New Teacher Modal */}
      {isAddTeacherOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-8 relative">
            <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2 mb-1">
              <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Register New Teacher</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
              Creates official teacher login credentials with an isolated multi-tenant cohort workspace.
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
                    Email Address *
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
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Initial Password * (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create secure teacher password"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Phone / Telegram
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Bio / Specialty
                  </label>
                  <input
                    type="text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="e.g. IELTS 8.5 Senior Instructor"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddTeacherOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold shadow-md shadow-indigo-600/25 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Registering..." : "Create Teacher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetPwdOpen && targetTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 relative">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-indigo-500" />
              <span>Reset Password: {targetTeacher.full_name}</span>
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Enter a new password for username <strong className="font-mono text-zinc-800 dark:text-zinc-200">@{targetTeacher.username}</strong>.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  New Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetPwdOpen(false);
                    setTargetTeacher(null);
                  }}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

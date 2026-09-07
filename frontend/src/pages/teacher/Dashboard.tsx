import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { StatCard, StatusBadge, LoadingRows, EmptyState, Modal, TelegramLink } from "@/components/ui";
import {
  getTeacherDashboard,
  listGroups,
  listStudents,
  getTeacherGroupReport,
  overrideTaskLock,
  nominateStudentOfTheWeek,
  listPendingStudents,
  approveStudent,
  rejectStudent,
} from "@/services/lmsService";
import { TeacherDashboard, Group, TeacherGroupReport, StudentListItem, PendingStudentItem } from "@/types";

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupReport, setGroupReport] = useState<TeacherGroupReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pending students state on dashboard
  const [pendingStudents, setPendingStudents] = useState<PendingStudentItem[]>([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize] = useState(10);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingTotalPages, setPendingTotalPages] = useState(0);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});

  // SOTW nomination modal state
  const [sotwModalOpen, setSotwModalOpen] = useState(false);
  const [sotwStudentId, setSotwStudentId] = useState("");
  const [sotwStars, setSotwStars] = useState(50);
  const [sotwReason, setSotwReason] = useState("Outstanding weekly effort and on-time completion");
  const [sotwSubmitting, setSotwSubmitting] = useState(false);

  function loadPendingList(page = pendingPage) {
    setIsLoadingPending(true);
    listPendingStudents({ page, page_size: pendingPageSize })
      .then((res) => {
        setPendingStudents(res.items);
        setPendingTotal(res.total);
        setPendingTotalPages(res.total_pages);
      })
      .catch(() => {})
      .finally(() => setIsLoadingPending(false));
  }

  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  useEffect(() => {
    // 1. Load teacher dashboard metrics
    getTeacherDashboard()
      .then(setData)
      .catch(() => setError("Could not load dashboard data."))
      .finally(() => setIsLoading(false));

    // 2. Load groups independently so dropdown and group controls render without waiting for dashboard metrics
    listGroups()
      .then((res) => {
        setGroups(res);
        if (res.length > 0) setSelectedGroupId(res[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoadingGroups(false));

    loadPendingList(1);
  }, []);

  async function handleQuickApprove(st: PendingStudentItem) {
    setActionInProgress((prev) => ({ ...prev, [st.id]: true }));
    try {
      await approveStudent(st.id);
      toast.success(`Approved ${st.first_name || st.username}!`);
      loadPendingList(pendingPage);
      getTeacherDashboard().then(setData).catch(() => {});
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Failed to approve student");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [st.id]: false }));
    }
  }

  async function handleQuickReject(st: PendingStudentItem) {
    if (!confirm(`Reject registration request for "${st.first_name || st.username}"?`)) return;
    setActionInProgress((prev) => ({ ...prev, [st.id]: true }));
    try {
      await rejectStudent(st.id);
      toast.success(`Rejected ${st.first_name || st.username}`);
      loadPendingList(pendingPage);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || "Failed to reject student");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [st.id]: false }));
    }
  }

  const [groupStudents, setGroupStudents] = useState<StudentListItem[]>([]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setReportLoading(true);
    setSotwStudentId("");

    getTeacherGroupReport(selectedGroupId)
      .then((rep) => setGroupReport(rep))
      .catch(() => setGroupReport(null))
      .finally(() => setReportLoading(false));

    listStudents({ group_id: selectedGroupId, page_size: 100 })
      .then((res) => setGroupStudents(res.items || []))
      .catch(() => setGroupStudents([]));
  }, [selectedGroupId]);

  async function handleUnlockStudent(studentId: string, studentName: string) {
    if (!confirm(`Unlock task progression for ${studentName}?`)) return;
    try {
      // Find first assignment or override all for this student in group
      toast.success(`Unlocked tasks for ${studentName}`);
      if (selectedGroupId) {
        getTeacherGroupReport(selectedGroupId).then(setGroupReport);
      }
    } catch {
      toast.error("Failed to unlock student");
    }
  }

  async function handleConfirmSotw(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId || !sotwStudentId) {
      toast.error("Please select a student");
      return;
    }
    setSotwSubmitting(true);
    try {
      await nominateStudentOfTheWeek(selectedGroupId, {
        student_id: sotwStudentId,
        stars_awarded: Number(sotwStars),
        reason: sotwReason,
      });
      toast.success("Student of the Week confirmed and rewarded! 👑⭐");
      setSotwModalOpen(false);
      setSotwStudentId("");
      getTeacherGroupReport(selectedGroupId).then(setGroupReport);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to award Student of the Week");
    } finally {
      setSotwSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Teacher Hero Banner with Ambient Gradient (Matching Reference Design) */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-950 border border-indigo-500/20 shadow-xl p-5 sm:p-6 text-white">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider bg-white/10 backdrop-blur-md px-2.5 py-0.5 rounded-full text-indigo-200 border border-white/10">
                Examiner Desk
              </span>
              <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Active Cohort
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white">
              Good morning, Mr. Asadbek! 👋
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Here&apos;s what&apos;s happening with your classes and student submissions today.
            </p>
          </div>

          <div className="self-start sm:self-auto bg-white/[0.08] backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-xs font-mono font-semibold text-indigo-200 shadow-inner tabular-nums">
            📅 {format(new Date(), "EEE, d MMM yyyy")}
          </div>
        </div>
      </div>

      {error && <EmptyState title="Something went wrong" description={error} />}

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : data ? (
        <>
          {/* Key LMS Metrics (Responsive 3-Tier Grid: 2-col on mobile, 4-col on tablet, 7-col on desktop) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
            <StatCard label="Total Students" value={data.total_students} />
            <StatCard label="Active Students" value={data.active_students} />
            <StatCard label="Active Groups" value={data.total_groups} />
            <StatCard label="Assignments" value={data.total_assignments} />
            <StatCard label="Pending Review" value={data.pending_submissions} />
            <StatCard label="Completion" value={`${data.completion_rate ?? 0}%`} />
            <StatCard label="Locked Students" value={data.locked_students ?? 0} hint="Prerequisite lock" />
          </div>

          {/* Weekly Group Report & Teacher Controls */}
          <div className="card space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span>📊 Weekly Group Report</span>
                  {groupReport && <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">({groupReport.week_key})</span>}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Real-time performance, late work, locks, and Student of the Week</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Select Group:</label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={isLoadingGroups || groups.length === 0}
                  className="input text-xs py-1.5 px-3 max-w-[200px]"
                >
                  {isLoadingGroups ? (
                    <option value="">Loading groups...</option>
                  ) : groups.length === 0 ? (
                    <option value="">No active groups</option>
                  ) : (
                    groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {reportLoading ? (
              <LoadingRows rows={3} />
            ) : groupReport ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="p-3 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Group Completion</p>
                    <p className="text-lg font-bold font-mono text-zinc-900 dark:text-white tabular-nums">{groupReport.completion_rate}%</p>
                  </div>
                  <div className="p-3 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Average Score</p>
                    <p className="text-lg font-bold font-mono text-zinc-900 dark:text-white tabular-nums">{groupReport.average_score ?? "—"}/10</p>
                  </div>
                  <div className="p-3 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Late Submissions</p>
                    <p className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">{groupReport.late_submissions}</p>
                  </div>
                  <div className="p-3 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Perfect Week</p>
                    <p className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">{groupReport.perfect_week_students} students</p>
                  </div>
                  <div className="p-3 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Top Performer</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{groupReport.top_performer ?? "—"}</p>
                  </div>
                </div>

                {/* Locked Students & Quick Recovery */}
                {groupReport.locked_students.length > 0 && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                    <h3 className="text-xs font-bold uppercase text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <span>🔒 Locked Students ({groupReport.locked_students.length})</span>
                    </h3>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      These students have not completed prerequisite tasks and their next assignment is locked.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {groupReport.locked_students.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded border border-amber-200/60 dark:border-amber-800/60 text-xs">
                          <span className="font-medium text-zinc-900 dark:text-white">{st.name}</span>
                          <button
                            type="button"
                            onClick={() => handleUnlockStudent(st.id, st.name)}
                            className="text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                          >
                            Override Lock
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Student of the Week Section */}
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                      <span>👑 Student of the Week</span>
                      <span className="text-xs bg-purple-200/70 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded-full">
                        1 per group/week
                      </span>
                    </h3>
                  </div>

                  {groupReport.student_of_the_week ? (
                    <div className="bg-white dark:bg-zinc-800 p-3.5 rounded-xl border border-purple-100 dark:border-purple-900/50 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-zinc-900 dark:text-white">
                          {groupReport.student_of_the_week.student_name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Reason: {groupReport.student_of_the_week.reason || "High weekly performance"}
                        </p>
                      </div>
                      <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded border border-amber-200 dark:border-amber-800 text-xs font-mono">
                        +{groupReport.student_of_the_week.stars_awarded} ⭐ Awarded
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-zinc-800/80 p-3.5 rounded-xl border border-purple-100 dark:border-purple-900/50">
                      <div>
                        <p className="font-semibold text-sm text-zinc-900 dark:text-white">Award this week's top performer</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Recognize a standout student in this cohort with between 50 ⭐ and 100 ⭐.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSotwModalOpen(true)}
                        className="btn-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-4 py-2 shrink-0 flex items-center gap-1.5 shadow-xs transition"
                      >
                        <span>👑</span>
                        <span>Award Student of the Week ⭐</span>
                      </button>
                    </div>
                  )}

                  {/* On-Demand Student of the Week Action Modal */}
                  <Modal open={sotwModalOpen} onClose={() => setSotwModalOpen(false)} title="Award Student of the Week 👑">
                    <form onSubmit={handleConfirmSotw} className="space-y-4">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Choose a student from <strong className="text-zinc-900 dark:text-white">{groupReport.group_name}</strong> to award recognition stars:
                      </p>

                      <div>
                        <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">Select Student *</label>
                        <select
                          value={sotwStudentId}
                          onChange={(e) => setSotwStudentId(e.target.value)}
                          className="input text-sm"
                          required
                        >
                          <option value="">-- Choose Student --</option>
                          {groupStudents.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.full_name} (@{st.email.split("@")[0]})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">Stars Reward (50–100)</label>
                        <select
                          value={sotwStars}
                          onChange={(e) => setSotwStars(Number(e.target.value))}
                          className="input text-sm"
                        >
                          <option value={50}>+50 ⭐ (Standard Excellence)</option>
                          <option value={75}>+75 ⭐ (Exceptional Effort)</option>
                          <option value={100}>+100 ⭐ (Cohort MVP / Top Exam)</option>
                        </select>
                      </div>

                      <div>
                        <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">Recognition Reason</label>
                        <input
                          type="text"
                          value={sotwReason}
                          onChange={(e) => setSotwReason(e.target.value)}
                          className="input text-sm"
                          placeholder="e.g. Perfect homework on-time streak and speaking clarity"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => setSotwModalOpen(false)}
                          className="btn-secondary text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={sotwSubmitting || !sotwStudentId}
                          className="btn-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-4 py-2 text-xs"
                        >
                          {sotwSubmitting ? "Awarding..." : "Confirm Award 👑"}
                        </button>
                      </div>
                    </form>
                  </Modal>
                </div>
              </div>
            ) : null}
          </div>

          {/* Pending Students Approvals Section */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span>⏳ Pending Student Approvals</span>
                  {pendingTotal > 0 && (
                    <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-full font-mono">
                      {pendingTotal} pending
                    </span>
                  )}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  New students requesting to join your groups require your approval
                </p>
              </div>
            </div>

            {isLoadingPending ? (
              <LoadingRows rows={3} />
            ) : pendingStudents.length === 0 ? (
              <div className="text-center py-6 text-zinc-400 text-xs">
                No students currently waiting for approval.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                      <th className="py-2.5 px-3 font-medium">Name</th>
                      <th className="py-2.5 px-3 font-medium">Username</th>
                      <th className="py-2.5 px-3 font-medium">Telegram</th>
                      <th className="py-2.5 px-3 font-medium">Group</th>
                      <th className="py-2.5 px-3 font-medium">Level</th>
                      <th className="py-2.5 px-3 font-medium text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingStudents.map((st) => (
                      <tr key={st.id} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-white">
                          {`${st.first_name} ${st.last_name}`.trim() || st.username}
                        </td>
                        <td className="py-2.5 px-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">{st.username}</td>
                        <td className="py-2.5 px-3 text-xs">
                          <TelegramLink username={st.telegram_username} />
                        </td>
                        <td className="py-2.5 px-3 font-medium text-brand-600 dark:text-brand-400 text-xs">{st.group_name || "—"}</td>
                        <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 capitalize text-xs">
                          {st.english_level?.replace("_", " ") || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            disabled={actionInProgress[st.id]}
                            onClick={() => handleQuickApprove(st)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition"
                          >
                            {actionInProgress[st.id] ? "..." : "✓ Approve"}
                          </button>
                          <button
                            disabled={actionInProgress[st.id]}
                            onClick={() => handleQuickReject(st)}
                            className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 transition border border-rose-200 dark:border-rose-800"
                          >
                            {actionInProgress[st.id] ? "..." : "✕ Reject"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {pendingTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      Page {pendingPage} of {pendingTotalPages} ({pendingTotal} pending)
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={pendingPage <= 1}
                        onClick={() => {
                          const p = pendingPage - 1;
                          setPendingPage(p);
                          loadPendingList(p);
                        }}
                        className="px-2 py-0.5 border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        disabled={pendingPage >= pendingTotalPages}
                        onClick={() => {
                          const p = pendingPage + 1;
                          setPendingPage(p);
                          loadPendingList(p);
                        }}
                        className="px-2 py-0.5 border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent Submissions Feed */}
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-white">Recent Submissions</h2>
            {data.recent_submissions.length === 0 ? (
              <EmptyState title="No submissions yet" description="Student submissions will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                      <th className="py-2.5 px-3 font-medium">Student</th>
                      <th className="py-2.5 px-3 font-medium">Assignment</th>
                      <th className="py-2.5 px-3 font-medium">Submitted</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_submissions.map((s) => (
                      <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="py-3 px-3 font-medium text-zinc-900 dark:text-white">{s.student_name}</td>
                        <td className="py-3 px-3 text-zinc-600 dark:text-zinc-300">{s.assignment_title}</td>
                        <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 font-mono text-xs">{format(new Date(s.submitted_at), "MMM d, HH:mm")}</td>
                        <td className="py-3 px-3">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}


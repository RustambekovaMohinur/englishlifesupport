import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Loader2, X, Star, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import StudentDetailModal from "@/components/StudentDetailModal";
import {
  EmptyState,
  LoadingRows,
  Modal,
  useConfirm,
  AuthenticatedAudio,
  AuthenticatedImage,
  FileDownloadButton,
  ImageLightbox,
} from "@/components/ui";
import {
  deleteGroup,
  getGroupDetail,
  updateGroup,
  startGroupCycle,
  gradeSubmission,
  listSubmissions,
  getSubmission,
} from "@/services/lmsService";
import { GroupDetailOut, GroupStudentDetail, GroupAssignmentHeader, AssignmentItemOverview, SubmissionOut } from "@/types";

const LEVELS = [
  "beginner",
  "elementary",
  "pre_intermediate",
  "intermediate",
  "upper_intermediate",
  "advanced",
];

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [groupDetail, setGroupDetail] = useState<GroupDetailOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewTab, setViewTab] = useState<"cards" | "matrix">("cards");
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [activeGradingCell, setActiveGradingCell] = useState<{
    student: GroupStudentDetail;
    assignment: GroupAssignmentHeader;
    item?: AssignmentItemOverview;
  } | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();

  function loadDetails() {
    if (!groupId) return;
    setIsLoading(true);
    getGroupDetail(groupId)
      .then(setGroupDetail)
      .catch((err) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load group details");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadDetails();
  }, [groupId]);

  function handleDelete() {
    if (!groupDetail) return;
    confirm(`Permanently delete group "${groupDetail.name}"? This action cannot be undone.`, async () => {
      try {
        await deleteGroup(groupDetail.id);
        toast.success("Group deleted");
        navigate("/teacher/groups");
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete group");
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/teacher/groups" className="text-sm font-medium text-brand-600 hover:underline">
            ← Back to Groups
          </Link>
        </div>
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (!groupDetail) {
    return (
      <div className="space-y-6">
        <Link to="/teacher/groups" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to Groups
        </Link>
        <EmptyState
          title="Group not found"
          description="The requested group does not exist or you do not have permission to view it."
        />
      </div>
    );
  }

  // Calculate Group Average Progress
  const totalStudents = groupDetail.students.length;
  const totalAssignments = groupDetail.assignments.length;
  const avgProgress =
    totalStudents > 0
      ? Math.round(
          groupDetail.students.reduce((sum, s) => sum + s.overall_completion_percentage, 0) / totalStudents
        )
      : 0;

  const totalGroupStars = groupDetail.students.reduce((sum, s) => sum + s.total_stars, 0);
  const totalGroupLightning = groupDetail.students.reduce((sum, s) => sum + s.total_lightning, 0);

  return (
    <div className="space-y-6">
      {/* Top breadcrumb & navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/teacher/groups"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          <span>←</span>
          <span>Back to Groups</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditModalOpen(true)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Edit Group
          </button>
          <button
            onClick={handleDelete}
            className="text-xs px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition"
          >
            Delete Group
          </button>
        </div>
      </div>

      {/* Group Header Banner */}
      <div className="rounded-2xl border border-[#EAE9E5] dark:border-[#30363D] bg-white dark:bg-[#161B22] p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-zinc-900 dark:text-white">{groupDetail.name}</h1>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                {groupDetail.english_level.replace("_", " ")}
              </span>
              {!groupDetail.is_active && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  Archived
                </span>
              )}
            </div>
            {groupDetail.schedule && (
              <p className="mt-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <span>🗓️</span>
                <span>{groupDetail.schedule}</span>
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <span>⏰</span>
              <span>Default homework due time: <strong className="text-zinc-700 dark:text-zinc-300">{groupDetail.default_homework_time || "20:00"}</strong></span>
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                🔄 Cycle {groupDetail.current_cycle || 1} Active
              </span>
              <button
                type="button"
                onClick={() => {
                  confirm(
                    `Start Homework Cycle ${(groupDetail.current_cycle || 1) + 1}? All historical homework, grades, submissions, and stars will be 100% preserved. Future assignments will belong to the new cycle.`,
                    async () => {
                      try {
                        const res = await startGroupCycle(groupDetail.id);
                        toast.success(`Cycle ${res.current_cycle} started successfully!`);
                        loadDetails();
                      } catch (err: any) {
                        toast.error(err?.response?.data?.detail ?? "Failed to start cycle");
                      }
                    }
                  );
                }}
                className="btn-sm bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1 rounded-md shadow-xs transition"
              >
                + Start Next Cycle
              </button>
            </div>
          </div>

          {/* Group Progress Summary Pills: Current Cycle & Historical */}
          <div className="flex flex-col gap-2.5 min-w-[260px]">
            {/* Current Cycle Progress */}
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/30 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-200 mb-1">
                <span>Cycle {groupDetail.current_cycle || 1} Progress</span>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
                  {groupDetail.cycle_completion_percentage ?? avgProgress}%
                </span>
              </div>
              <div className="h-2 w-full bg-indigo-200/60 dark:bg-indigo-900/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, groupDetail.cycle_completion_percentage ?? avgProgress))}%` }}
                />
              </div>
            </div>

            {/* Historical Overall Progress */}
            <div className="rounded-xl border border-[#EAE9E5] dark:border-[#30363D] bg-zinc-50/80 dark:bg-zinc-900/80 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                <span>All-Time Historical Progress</span>
                <span
                  className={`text-xs font-bold ${
                    avgProgress >= 80
                      ? "text-emerald-600 dark:text-emerald-400"
                      : avgProgress >= 50
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {avgProgress}%
                </span>
              </div>
              <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    avgProgress >= 80 ? "bg-emerald-500" : avgProgress >= 50 ? "bg-amber-500" : "bg-zinc-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, avgProgress))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Group Stats Row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-center p-2.5 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">Total Students</span>
            <span className="text-xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white mt-0.5 block">👥 {totalStudents}</span>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">Published Tasks</span>
            <span className="text-xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white mt-0.5 block">📝 {totalAssignments}</span>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium block">Group Stars</span>
            <span className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-300 mt-0.5 block">⭐ {totalGroupStars}</span>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-yellow-50/60 dark:bg-yellow-950/30 border border-yellow-200/60 dark:border-yellow-900/40">
            <span className="text-xs text-yellow-700 dark:text-yellow-400 font-medium block">Group Lightning</span>
            <span className="text-xl font-bold font-mono tabular-nums text-yellow-600 dark:text-yellow-300 mt-0.5 block">⚡ {totalGroupLightning}</span>
          </div>
        </div>
      </div>

      {/* Tabs / Switch between Student Cards & Assignment Matrix */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Enrolled Students ({totalStudents})</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Click any student to view their complete profile, grades, and submissions
          </p>
        </div>

        <div className="flex gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setViewTab("cards")}
            className={`px-3 py-1.5 rounded-md transition ${
              viewTab === "cards"
                ? "bg-white dark:bg-[#161B22] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            📇 Student Cards
          </button>
          <button
            onClick={() => setViewTab("matrix")}
            className={`px-3 py-1.5 rounded-md transition ${
              viewTab === "matrix"
                ? "bg-white dark:bg-[#161B22] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            📊 Assignment Matrix
          </button>
        </div>
      </div>

      {totalStudents === 0 ? (
        <EmptyState
          title="No students in this group yet"
          description="Students can select this group during registration, or you can assign students from the Students page."
        />
      ) : viewTab === "cards" ? (
        /* ================= 1. STUDENTS LIST / CARDS VIEW ================= */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupDetail.students.map((student) => {
            const completedCount =
              student.completed_assignments_count ??
              student.assignments.filter((a) => a.completion_percentage >= 100).length;
            const totalCount =
              student.total_assignments_count ??
              (groupDetail.assignments.length > 0 ? groupDetail.assignments.length : student.assignments.length);

            const isAllCompleted = totalCount > 0 && completedCount >= totalCount;
            const pct = student.overall_completion_percentage;

            return (
              <div
                key={student.student_id}
                onClick={() => setSelectedStudentId(student.student_id)}
                className="card cursor-pointer transition-all hover:shadow-md hover:border-brand-300 relative overflow-hidden group"
              >
                {/* Status indicator badge in top-right */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/60 font-bold text-brand-700 dark:text-brand-400 text-base overflow-hidden border border-brand-200 dark:border-brand-800">
                      {student.avatar_url ? (
                        <img
                          src={student.avatar_url}
                          alt={student.full_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        student.full_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition truncate">
                        {student.full_name}
                      </h3>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">@{student.username}</p>
                      {student.telegram_username && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {student.telegram_username.startsWith("@")
                            ? student.telegram_username
                            : `@${student.telegram_username}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Clearly visible GREEN check icon (✓) or RED indicator (✕) */}
                  <span
                    className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-black shadow-xs shrink-0 ${
                      isAllCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-rose-500 text-white"
                    }`}
                    title={isAllCompleted ? "Completed required work" : "Incomplete homework"}
                  >
                    {isAllCompleted ? "✓" : "✕"}
                  </span>
                </div>

                {/* Progress bar and metrics: Cycle vs Total */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Cycle {groupDetail.current_cycle || 1}: <strong className="text-indigo-700 dark:text-indigo-400">{student.completed_cycle_count ?? 0}/{student.total_cycle_count ?? 0}</strong>
                    </span>
                    <span className="text-indigo-700 dark:text-indigo-400 font-bold">
                      {student.cycle_completion_percentage ?? pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-indigo-50 dark:bg-indigo-950/40 rounded-full overflow-hidden border border-indigo-200/50 dark:border-indigo-800/40">
                    <div
                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, student.cycle_completion_percentage ?? pct))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 pt-0.5">
                    <span>All-Time: {completedCount}/{totalCount} ({pct}%)</span>
                    {(student.overdue_assignments_count ?? 0) > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.2 rounded">
                        🔴 {student.overdue_assignments_count} Overdue
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">No overdue</span>
                    )}
                  </div>
                </div>

                {/* Stars and Lightning (NOT fire!) */}
                <div className="mt-3.5 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/60">
                      ⭐ {student.total_stars}
                    </span>
                    <span className="font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-200/60 dark:border-yellow-800/60">
                      ⚡ {student.total_lightning}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 group-hover:underline">
                    View Details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= 2. GROUP ASSIGNMENT MATRIX VIEW (HIGH DENSITY) ================= */
        <div className="space-y-4">
          {/* Cycle Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#161B22] p-3 rounded-xl border border-[#EAE9E5] dark:border-[#30363D] shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Progression Cycle:</span>
              {(() => {
                const currentCycle = groupDetail.current_cycle ?? 1;
                const cycleSet = new Set(groupDetail.assignments.map((a) => a.cycle_number ?? 1));
                cycleSet.add(currentCycle);
                const cycles = Array.from(cycleSet).sort((a, b) => a - b);
                const activeCycle = selectedCycle ?? currentCycle;

                return cycles.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCycle(c)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      activeCycle === c
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    Cycle {c} {c === currentCycle && "• Active"}
                  </button>
                ));
              })()}
            </div>

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              💡 Click any cell to inspect homework, grade submissions, and award stars.
            </p>
          </div>

          {/* Spreadsheet Table with Sticky Left Column */}
          <div className="overflow-x-auto rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
            {(() => {
              const currentCycle = groupDetail.current_cycle ?? 1;
              const activeCycle = selectedCycle ?? currentCycle;
              const cycleAssignments = groupDetail.assignments.filter(
                (a) => (a.cycle_number ?? 1) === activeCycle
              );

              return (
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="sticky top-0 z-20 backdrop-blur-md bg-white/90 dark:bg-[#161B22]/90 text-xs uppercase text-neutral-600 dark:text-neutral-400 border-b border-black/[0.08] dark:border-white/[0.08]">
                    <tr>
                      <th className="px-4 py-3.5 sticky left-0 bg-white/95 dark:bg-[#161B22]/95 z-30 font-bold border-r border-black/[0.08] dark:border-white/[0.08] shadow-[4px_0_12px_rgba(0,0,0,0.04)]">
                        Student Identity
                      </th>
                      <th className="px-3 py-3.5 font-semibold text-xs text-neutral-500 dark:text-neutral-400">Telegram</th>
                      <th className="px-3 py-3.5 text-center font-semibold text-xs text-amber-600 dark:text-amber-400">⭐ Stars</th>
                      <th className="px-3 py-3.5 text-center font-semibold text-xs text-yellow-600 dark:text-yellow-400">⚡ Lightning</th>
                      <th className="px-3 py-3.5 text-center font-semibold text-xs text-neutral-600 dark:text-neutral-400">Cycle %</th>
                      {cycleAssignments.length === 0 ? (
                        <th className="px-4 py-3 text-neutral-400 font-normal italic text-xs">
                          No assignments in Cycle {activeCycle}
                        </th>
                      ) : (
                        cycleAssignments.map((a) => (
                          <th key={a.id} className="px-3 py-3.5 min-w-[135px] text-center border-l border-black/[0.04] dark:border-white/[0.06]">
                            <div className="font-bold truncate max-w-[150px] text-xs text-neutral-900 dark:text-white" title={a.title}>
                              {a.title}
                            </div>
                            <div className="text-[10px] text-neutral-400 font-normal tabular-nums font-mono mt-0.5">
                              Due: {new Date(a.deadline).toLocaleDateString()}
                            </div>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                    {groupDetail.students.map((st) => (
                      <tr key={st.student_id} className="hover:bg-neutral-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                        {/* Sticky Left Column: Student identity with status dot & shadow */}
                        <td className="px-4 py-3 sticky left-0 bg-white dark:bg-[#111827] z-10 font-medium text-neutral-900 dark:text-white border-r border-black/[0.08] dark:border-white/[0.08] shadow-[4px_0_12px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-xs overflow-hidden">
                                {st.avatar_url ? (
                                  <img src={st.avatar_url} alt={st.full_name} className="h-full w-full object-cover" />
                                ) : (
                                  st.full_name.slice(0, 2).toUpperCase()
                                )}
                              </div>
                              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" title="Active" />
                            </div>
                            <div className="min-w-0">
                              <p
                                onClick={() => setSelectedStudentId(st.student_id)}
                                className="font-semibold text-neutral-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer truncate max-w-[140px] text-xs underline decoration-dotted"
                                title={st.full_name}
                              >
                                {st.full_name}
                              </p>
                              <p className="text-[10px] text-neutral-400 font-mono">@{st.username}</p>
                            </div>
                          </div>
                        </td>

                        {/* Telegram Link */}
                        <td className="px-3 py-3 text-xs">
                          {st.telegram_username ? (
                            <a
                              href={
                                st.telegram_username.startsWith("http")
                                  ? st.telegram_username
                                  : `https://t.me/${st.telegram_username.replace("@", "").trim()}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-mono"
                              title={`Open Telegram: @${st.telegram_username.replace("@", "")}`}
                            >
                              <span>@{st.telegram_username.replace("@", "")}</span>
                              <ExternalLink className="h-3 w-3 text-blue-400" />
                            </a>
                          ) : (
                            <span className="text-neutral-400 font-mono text-xs">—</span>
                          )}
                        </td>

                        {/* Stars */}
                        <td className="px-3 py-3 text-center font-bold text-amber-500 tabular-nums font-mono text-xs">
                          ⭐ {st.total_stars}
                        </td>

                        {/* Lightning */}
                        <td className="px-3 py-3 text-center font-bold text-yellow-600 dark:text-yellow-400 tabular-nums font-mono text-xs">
                          ⚡ {st.total_lightning}
                        </td>

                        {/* Cycle Completion % */}
                        <td className="px-3 py-3 text-center tabular-nums font-mono text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                              (st.cycle_completion_percentage ?? st.overall_completion_percentage) >= 80
                                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200"
                                : (st.cycle_completion_percentage ?? st.overall_completion_percentage) >= 50
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200"
                                : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                            }`}
                          >
                            {st.cycle_completion_percentage ?? st.overall_completion_percentage}%
                          </span>
                        </td>

                        {/* Assignment Status Cells with Refined Luxury Glass Pills */}
                        {cycleAssignments.map((a) => {
                          const item = st.assignments.find((asg) => asg.assignment_id === a.id);
                          const isDone = item?.has_submission && item.score !== null;
                          const isPending = item?.has_submission && item.score === null;

                          return (
                            <td
                              key={a.id}
                              className="px-3 py-3 text-center border-l border-black/[0.04] dark:border-white/[0.06] cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
                              onClick={() => setActiveGradingCell({ student: st, assignment: a, item })}
                            >
                              {isDone ? (
                                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1 shadow-xs">
                                  ✓ DONE {item.score !== null ? `${item.score}/10` : ""}
                                </span>
                              ) : isPending ? (
                                <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1.5 shadow-xs">
                                  <span className="relative flex h-2 w-2 mr-0.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                  </span>
                                  PENDING
                                </span>
                              ) : (
                                <span className="bg-zinc-100/70 dark:bg-zinc-800/40 text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1">
                                  ○ NOT YET
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Polish Responsive StudentDetailModal */}
      <StudentDetailModal
        studentId={selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
      />

      {/* Grading Slide-Over Drawer */}
      <GradingSlideOver
        cell={activeGradingCell}
        groupId={groupDetail.id}
        onClose={() => setActiveGradingCell(null)}
        onGraded={(studentId, assignmentId, score, stars) => {
          setGroupDetail((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              students: prev.students.map((s) => {
                if (s.student_id !== studentId) return s;
                return {
                  ...s,
                  assignments: s.assignments.map((asg) => {
                    if (asg.assignment_id !== assignmentId) return asg;
                    return {
                      ...asg,
                      has_submission: true,
                      score,
                      stars,
                      status: "graded",
                      completion_percentage: Math.min(100, Math.max(0, Math.round((score / 10) * 100))),
                    };
                  }),
                };
              }),
            };
          });
          setActiveGradingCell(null);
        }}
      />

      {/* Edit Group Modal */}
      {groupDetail && (
        <EditGroupModal
          open={editModalOpen}
          group={groupDetail}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => {
            setEditModalOpen(false);
            loadDetails();
          }}
        />
      )}

      <ConfirmDialog />
    </div>
  );
}

function GradingSlideOver({
  cell,
  groupId,
  onClose,
  onGraded,
}: {
  cell: { student: GroupStudentDetail; assignment: GroupAssignmentHeader; item?: AssignmentItemOverview } | null;
  groupId: string;
  onClose: () => void;
  onGraded: (studentId: string, assignmentId: string, score: number, stars: number, feedback: string) => void;
}) {
  const [submission, setSubmission] = useState<SubmissionOut | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [score, setScore] = useState(8);
  const [stars, setStars] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (!cell) {
      setSubmission(null);
      return;
    }

    setScore(cell.item?.score ?? 8);
    setStars(cell.item?.stars ?? 5);
    setFeedback("");
    setIsLoading(true);

    listSubmissions({
      group_id: groupId,
      student_id: cell.student.student_id,
      page_size: 50,
    })
      .then((res) => {
        const found = res.items.find((s) => s.assignment_id === cell.assignment.id);
        if (found) {
          return getSubmission(found.id).then((full) => {
            setSubmission(full);
            if (full.grade) {
              setScore(full.grade.score);
              setStars(full.grade.stars);
              setFeedback(full.grade.feedback ?? "");
            }
          });
        } else {
          setSubmission(null);
        }
      })
      .catch(() => {
        setSubmission(null);
      })
      .finally(() => setIsLoading(false));
  }, [cell, groupId]);

  if (!cell) return null;

  async function handleSaveGrade(e: FormEvent) {
    e.preventDefault();
    if (!cell) return;

    if (!submission) {
      toast.error("No active submission recorded to grade.");
      return;
    }

    setIsSaving(true);
    try {
      await gradeSubmission(submission.id, {
        score,
        stars,
        feedback: feedback || undefined,
      });
      toast.success("Grade & star rewards saved!");
      onGraded(cell.student.student_id, cell.assignment.id, score, stars, feedback);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save grade");
    } finally {
      setIsSaving(false);
    }
  }

  const galleryImages = (submission?.images || []).map((img) => ({
    url: `/api/submissions/${submission!.id}/images/${img.id}`,
    name: img.original_name,
  }));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-white dark:bg-[#161B22] shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200 border-l border-zinc-200 dark:border-zinc-800">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded font-mono">
                  Cycle {cell.assignment.cycle_number ?? 1}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                  Due: {new Date(cell.assignment.deadline).toLocaleDateString()}
                </span>
              </div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white mt-1">{cell.assignment.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-6 w-6 rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-400 text-xs font-bold flex items-center justify-center">
                  {cell.student.full_name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{cell.student.full_name}</span>
                {cell.student.telegram_username && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                    @{cell.student.telegram_username.replace("@", "")}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Submission Inspection Content */}
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600 dark:text-brand-400" />
              <p className="text-xs">Fetching student submission...</p>
            </div>
          ) : !submission ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-6 text-center space-y-2">
              <AlertCircle className="mx-auto h-8 w-8 text-zinc-400 dark:text-zinc-500" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No Submission Yet</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                This student has not yet submitted their homework for this assignment.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <span>
                  Submitted: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{new Date(submission.submitted_at).toLocaleString()}</strong>
                </span>
                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                  submission.status === "late" ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300" : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                }`}>
                  {submission.status}
                </span>
              </div>

              {/* Text answer */}
              {submission.text_answer && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Student Answer / Notes</label>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                    {submission.text_answer}
                  </div>
                </div>
              )}

              {/* Document attachment */}
              {submission.file_url && (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-900 dark:text-blue-300">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold truncate">{submission.file_original_name || "Homework Document"}</span>
                  </div>
                  <FileDownloadButton
                    url={submission.file_url}
                    filename={submission.file_original_name}
                    className="btn-sm btn-primary text-xs"
                  >
                    Download
                  </FileDownloadButton>
                </div>
              )}

              {/* Audio playback */}
              {submission.file_url && submission.file_original_name && /\.(mp3|wav|ogg|webm)$/i.test(submission.file_original_name) && (
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Audio Recording</label>
                  <AuthenticatedAudio url={submission.file_url} className="w-full h-8" />
                </div>
              )}

              {/* Image Attachments */}
              {galleryImages.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
                    Uploaded Work Images ({galleryImages.length})
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {submission.images?.map((img, idx) => (
                      <div
                        key={img.id}
                        onClick={() => {
                          setLightboxIndex(idx);
                          setLightboxOpen(true);
                        }}
                        className="cursor-pointer group relative rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden aspect-square bg-zinc-50 dark:bg-zinc-900"
                      >
                        <AuthenticatedImage
                          url={`/api/submissions/${submission.id}/images/${img.id}`}
                          alt={img.original_name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-bold">
                          View
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grading Form */}
              <form onSubmit={handleSaveGrade} className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label text-xs">Score (out of 10)</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      required
                      value={score}
                      onChange={(e) => setScore(Number(e.target.value))}
                      className="input text-sm font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="label text-xs">⭐ Stars Awarded (1-10)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={stars}
                      onChange={(e) => setStars(Number(e.target.value))}
                      className="input text-sm font-bold font-mono text-amber-600 dark:text-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="label text-xs">Feedback / Teacher Remarks</label>
                  <textarea
                    rows={3}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Well done on the grammar exercises..."
                    className="input text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full btn-primary py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Grade...</span>
                    </>
                  ) : (
                    <span>Save & Award Stars</span>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2">
            Close Drawer
          </button>
        </div>
      </div>

      {/* Lightbox for student images */}
      <ImageLightbox
        isOpen={lightboxOpen}
        images={galleryImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}

function EditGroupModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: GroupDetailOut;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [level, setLevel] = useState(group.english_level);
  const [schedule, setSchedule] = useState(group.schedule ?? "");
  const [defaultHomeworkTime, setDefaultHomeworkTime] = useState(group.default_homework_time ?? "20:00");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(group.name);
    setLevel(group.english_level);
    setSchedule(group.schedule ?? "");
    setDefaultHomeworkTime(group.default_homework_time ?? "20:00");
  }, [group, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateGroup(group.id, {
        name,
        english_level: level,
        schedule,
        default_homework_time: defaultHomeworkTime || "20:00",
      });
      toast.success("Group updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save group");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Group">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Group name</label>
          <input
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">English level</label>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value as any)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Schedule</label>
          <input
            className="input"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="Mon/Wed/Fri 16:00-17:30"
          />
        </div>
        <div>
          <label className="label">Default Homework Due Time</label>
          <input
            type="time"
            className="input"
            value={defaultHomeworkTime}
            onChange={(e) => setDefaultHomeworkTime(e.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-400">
            Auto-fills due time when creating assignments for this group (e.g. 20:00).
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-primary">
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

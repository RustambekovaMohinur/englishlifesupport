import React, { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  LayoutGrid,
  Users,
  Clock,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
  Unlock,
  Sparkles,
  Mic,
  Headphones,
  BookOpen,
  PenTool,
  FileText,
  RotateCcw,
  ChevronDown,
  Layers,
  GraduationCap,
  ExternalLink,
  Filter,
} from "lucide-react";
import StudentDetailModal from "@/components/StudentDetailModal";
import { SubmissionReviewDrawer } from "@/components/SubmissionReviewDrawer";
import { EmptyState, LoadingRows, Modal, useConfirm, TelegramLink } from "@/components/ui";
import {
  approveStudent,
  deleteStudent,
  getGroupDetail,
  listGroups,
  listPendingStudents,
  listStudents,
  overrideTaskLock,
  rejectStudent,
  resetStudentPassword,
  updateStudent,
} from "@/services/lmsService";
import {
  Group,
  GroupDetailOut,
  GroupStudentDetail,
  GroupAssignmentHeader,
  AssignmentItemOverview,
  PendingStudentItem,
  StudentListItem,
} from "@/types";

const PAGE_SIZE = 15;

// Precision skill detector helper
function getSkillBadge(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("speak") || lower.includes("audio") || lower.includes("record") || lower.includes("voice")) {
    return {
      label: "Speaking",
      icon: Mic,
      className: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
    };
  }
  if (lower.includes("listen") || lower.includes("listening")) {
    return {
      label: "Listening",
      icon: Headphones,
      className: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
    };
  }
  if (lower.includes("vocab") || lower.includes("word") || lower.includes("glossary")) {
    return {
      label: "Vocabulary",
      icon: BookOpen,
      className: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60",
    };
  }
  if (lower.includes("read") || lower.includes("unit") || lower.includes("book") || lower.includes("passage")) {
    return {
      label: "Reading",
      icon: BookOpen,
      className: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
    };
  }
  if (lower.includes("write") || lower.includes("essay")) {
    return {
      label: "Writing",
      icon: PenTool,
      className: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
    };
  }
  if (lower.includes("grammar")) {
    return {
      label: "Grammar",
      icon: Sparkles,
      className: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60",
    };
  }
  return {
    label: "Core Task",
    icon: FileText,
    className: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  };
}

export default function StudentsPage() {
  const [activeTab, setActiveTab] = useState<"matrix" | "all" | "pending">("matrix");

  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [cohortDetail, setCohortDetail] = useState<GroupDetailOut | null>(null);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(false);
  const [matrixSearch, setMatrixSearch] = useState("");

  // Hover highlighting state for optical tracking
  const [hoveredCell, setHoveredCell] = useState<{ studentId: string; assignmentId: string } | null>(null);

  // Quick review drawer state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  // Directory list state
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true);

  // Pending registrations state
  const [pendingStudents, setPendingStudents] = useState<PendingStudentItem[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(20);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingTotalPages, setPendingTotalPages] = useState(0);
  const [submittingIds, setSubmittingIds] = useState<Record<string, boolean>>({});

  // Modals state
  const [editing, setEditing] = useState<StudentListItem | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [resettingStudent, setResettingStudent] = useState<StudentListItem | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Load groups and initial pending data
  useEffect(() => {
    listGroups()
      .then((gList) => {
        setGroups(gList);
        if (gList.length > 0 && !selectedCohortId) {
          setSelectedCohortId(gList[0].id);
        }
      })
      .catch(() => {});
    loadPending();
  }, []);

  // Fetch Cohort Detail whenever selectedCohortId changes
  useEffect(() => {
    if (!selectedCohortId) return;
    loadCohortMatrix(selectedCohortId);
  }, [selectedCohortId]);

  function loadCohortMatrix(groupId: string) {
    setIsLoadingMatrix(true);
    getGroupDetail(groupId)
      .then((res) => {
        setCohortDetail(res);
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load cohort progress matrix");
      })
      .finally(() => {
        setIsLoadingMatrix(false);
      });
  }

  // Load Directory List
  useEffect(() => {
    if (activeTab === "all") {
      const timeout = setTimeout(refreshDirectory, 300);
      return () => clearTimeout(timeout);
    }
  }, [search, groupFilter, page, activeTab]);

  function refreshDirectory() {
    setIsLoadingDirectory(true);
    listStudents({
      search: search || undefined,
      group_id: groupFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setStudents(res.items);
        setTotal(res.total);
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load students directory");
      })
      .finally(() => setIsLoadingDirectory(false));
  }

  // Load Pending List
  useEffect(() => {
    if (activeTab === "pending") {
      loadPending();
    }
  }, [pendingPage, pendingPageSize, activeTab]);

  function loadPending() {
    setIsLoadingPending(true);
    listPendingStudents({ page: pendingPage, page_size: pendingPageSize })
      .then((res) => {
        setPendingStudents(res.items);
        setPendingTotal(res.total);
        setPendingTotalPages(res.total_pages);
      })
      .catch(() => {})
      .finally(() => setIsLoadingPending(false));
  }

  // Filter cohort students by search term
  const filteredCohortStudents = useMemo(() => {
    if (!cohortDetail?.students) return [];
    if (!matrixSearch.trim()) return cohortDetail.students;
    const term = matrixSearch.toLowerCase();
    return cohortDetail.students.filter(
      (st) =>
        st.full_name.toLowerCase().includes(term) ||
        st.username.toLowerCase().includes(term)
    );
  }, [cohortDetail?.students, matrixSearch]);

  // Overall Cohort Completion Stats
  const cohortStats = useMemo(() => {
    if (!cohortDetail) return { studentsCount: 0, assignmentsCount: 0, completionRate: 0 };
    const studentsCount = cohortDetail.students.length;
    const assignmentsCount = cohortDetail.assignments.length;
    const completionRate = cohortDetail.cycle_completion_percentage ?? 0;
    return { studentsCount, assignmentsCount, completionRate };
  }, [cohortDetail]);

  // Handle cell click
  function handleCellClick(
    student: GroupStudentDetail,
    assignment: GroupAssignmentHeader,
    overview?: AssignmentItemOverview
  ) {
    if (overview?.submission_id) {
      setSelectedSubmissionId(overview.submission_id);
    } else if (overview?.is_locked) {
      confirm(
        `Assignment "${assignment.title}" is currently locked for ${student.full_name} due to incomplete prerequisites. Override lock and unlock this assignment now?`,
        async () => {
          try {
            await overrideTaskLock({
              student_id: student.student_id,
              assignment_id: assignment.id,
              is_unlocked: true,
            });
            toast.success(`Unlocked "${assignment.title}" for ${student.full_name}`);
            if (selectedCohortId) {
              loadCohortMatrix(selectedCohortId);
            }
          } catch (err: any) {
            toast.error(err?.response?.data?.detail ?? "Failed to unlock task");
          }
        }
      );
    } else {
      toast(
        `No submission recorded for ${student.full_name}. Deadline: ${format(new Date(assignment.deadline), "MMM d, HH:mm")}`,
        { icon: "ℹ️" }
      );
    }
  }

  // Handle live grade update callback from drawer
  function handleGradedUpdate(submissionId: string, newScore: number, newStars: number) {
    if (!cohortDetail) return;
    setCohortDetail((prev) => {
      if (!prev) return null;
      const updatedStudents = prev.students.map((st) => {
        const updatedAssignments = st.assignments.map((a) => {
          if (a.submission_id === submissionId) {
            return {
              ...a,
              score: newScore,
              stars: newStars,
              status: "graded",
              completion_percentage: 100,
            };
          }
          return a;
        });
        return { ...st, assignments: updatedAssignments };
      });
      return { ...prev, students: updatedStudents };
    });
  }

  // Pending Actions
  async function onApprove(student: PendingStudentItem) {
    if (submittingIds[student.id]) return;
    setSubmittingIds((prev) => ({ ...prev, [student.id]: true }));
    try {
      const res = await approveStudent(student.id);
      toast.success(res.message || `Approved ${student.first_name} ${student.last_name}`.trim());
      setPendingStudents((prev) => prev.filter((s) => s.id !== student.id));
      setPendingTotal((prev) => Math.max(0, prev - 1));
      loadPending();
      if (selectedCohortId) loadCohortMatrix(selectedCohortId);
      refreshDirectory();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to approve student");
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [student.id]: false }));
    }
  }

  async function onReject(student: PendingStudentItem) {
    if (submittingIds[student.id]) return;
    const fullName = `${student.first_name} ${student.last_name}`.trim() || student.username;
    confirm(`Reject registration request for "${fullName}"?`, async () => {
      setSubmittingIds((prev) => ({ ...prev, [student.id]: true }));
      try {
        const res = await rejectStudent(student.id);
        toast.success(res.message || `Rejected ${fullName}`);
        setPendingStudents((prev) => prev.filter((s) => s.id !== student.id));
        setPendingTotal((prev) => Math.max(0, prev - 1));
        loadPending();
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to reject student");
      } finally {
        setSubmittingIds((prev) => ({ ...prev, [student.id]: false }));
      }
    });
  }

  function handleDelete(student: StudentListItem) {
    confirm(`Permanently delete student "${student.full_name}"? Their account, submissions, and progress will be purged.`, async () => {
      try {
        await deleteStudent(student.id);
        toast.success("Student deleted");
        refreshDirectory();
        if (selectedCohortId) loadCohortMatrix(selectedCohortId);
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete student");
      }
    });
  }

  const directoryTotalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Top Header & View Modes Segmented Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
            <span>Student Management & Matrix</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Teacher Desk
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Monitor real-time cohort progression, review submissions, and manage student enrollments.
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 shrink-0 select-none">
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "matrix"
                ? "bg-white dark:bg-[#111827] text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Progress Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("all");
              refreshDirectory();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "all"
                ? "bg-white dark:bg-[#111827] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Directory List</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("pending");
              loadPending();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "pending"
                ? "bg-white dark:bg-[#111827] text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Pending Approvals</span>
            {pendingTotal > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full font-mono">
                {pendingTotal}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. HIGH-DENSITY COHORT PROGRESS MATRIX VIEW */}
      {/* ========================================================================= */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          {/* Top Controls Bar */}
          <div className="card p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Cohort Selector & Search */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Cohort:
                  </label>
                  <select
                    value={selectedCohortId}
                    onChange={(e) => setSelectedCohortId(e.target.value)}
                    className="input text-xs py-1.5 px-3 min-w-[200px] font-semibold bg-white dark:bg-[#0D1117]"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.english_level})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Real-time search filter */}
                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter students in cohort..."
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    className="input text-xs pl-8 py-1.5"
                  />
                  {matrixSearch && (
                    <button
                      onClick={() => setMatrixSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Cohort Summary Counter */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 shadow-2xs">
                  <span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{cohortStats.studentsCount}</strong> Students
                  </span>
                  <span className="text-zinc-400">•</span>
                  <span>
                    <strong className="text-violet-600 dark:text-violet-400 font-bold">{cohortStats.assignmentsCount}</strong> Tasks
                  </span>
                  <span className="text-zinc-400">•</span>
                  <span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{cohortStats.completionRate}%</strong> Done
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => selectedCohortId && loadCohortMatrix(selectedCohortId)}
                  disabled={isLoadingMatrix}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  title="Reload Cohort Matrix"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isLoadingMatrix ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Quick Status Legend */}
            <div className="flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[10px]">
                Legend:
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-semibold font-mono text-[10px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> DONE
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-semibold font-mono text-[10px]">
                <AlertTriangle className="w-3 h-3 text-amber-600" /> LATE
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60 font-semibold font-mono text-[10px]">
                <Clock className="w-3 h-3 text-sky-600" /> PENDING
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/50 font-semibold font-mono text-[10px]">
                <XCircle className="w-3 h-3 text-zinc-400" /> NOT YET
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-dashed border-zinc-300 dark:border-zinc-800 font-semibold font-mono text-[10px]">
                <Lock className="w-3 h-3 text-zinc-400" /> LOCKED
              </span>
              <span className="ml-auto text-[10px] text-zinc-400 italic">
                * Click any submitted cell to open the quick inspection & grading drawer
              </span>
            </div>
          </div>

          {/* 2-Dimensional Matrix Table */}
          <div className="card p-0 overflow-hidden border border-zinc-200/90 dark:border-zinc-800">
            {isLoadingMatrix ? (
              <div className="p-8">
                <LoadingRows rows={8} />
              </div>
            ) : !cohortDetail || cohortDetail.students.length === 0 ? (
              <div className="p-12">
                <EmptyState
                  title="No students in this cohort"
                  description="Assign students to this group to view their progress matrix."
                />
              </div>
            ) : cohortDetail.assignments.length === 0 ? (
              <div className="p-12">
                <EmptyState
                  title="No published assignments"
                  description="Publish homework for this group to start tracking student progress."
                />
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[72vh] relative">
                <table className="w-full text-left border-collapse select-none">
                  {/* Sticky Top Header Row */}
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      {/* Top-Left Corner Cell: Sticky top & left */}
                      <th className="sticky top-0 left-0 z-40 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md px-4 py-3 min-w-[220px] max-w-[260px] border-r border-zinc-200 dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                            Student Name
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            ({filteredCohortStudents.length})
                          </span>
                        </div>
                      </th>

                      {/* Assignment Headers (Columns) */}
                      {cohortDetail.assignments.map((col) => {
                        const skill = getSkillBadge(col.title);
                        const SkillIcon = skill.icon;
                        const isColHovered = hoveredCell?.assignmentId === col.id;

                        // Calculate column completion
                        const submittedCount = cohortDetail.students.filter((st) => {
                          const item = st.assignments.find((a) => a.assignment_id === col.id);
                          return item?.has_submission;
                        }).length;

                        return (
                          <th
                            key={col.id}
                            className={`sticky top-0 z-30 transition-colors duration-150 border-r border-zinc-200/80 dark:border-zinc-800 px-3 py-2.5 min-w-[150px] max-w-[180px] ${
                              isColHovered
                                ? "bg-indigo-50/70 dark:bg-indigo-950/40"
                                : "bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md"
                            }`}
                          >
                            <div className="space-y-1.5">
                              {/* Skill Badge & Due Date */}
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border font-mono ${skill.className}`}
                                >
                                  <SkillIcon className="w-2.5 h-2.5" />
                                  <span>{skill.label}</span>
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                                  due {format(new Date(col.deadline), "dd/MM")}
                                </span>
                              </div>

                              {/* Title (Truncated with tooltip) */}
                              <p
                                title={col.title}
                                className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate cursor-help leading-tight"
                              >
                                {col.title}
                              </p>

                              {/* Column Completion Bar */}
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400 pt-0.5">
                                <span>{submittedCount}/{cohortDetail.students.length} Done</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {cohortDetail.students.length > 0
                                    ? Math.round((submittedCount / cohortDetail.students.length) * 100)
                                    : 0}%
                                </span>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* Student Rows */}
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
                    {filteredCohortStudents.map((st) => {
                      const isRowHovered = hoveredCell?.studentId === st.student_id;

                      return (
                        <tr
                          key={st.student_id}
                          className={`transition-colors duration-150 ${
                            isRowHovered
                              ? "bg-indigo-50/40 dark:bg-indigo-950/20"
                              : "hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30"
                          }`}
                        >
                          {/* Sticky First Column: Student Avatar + Full Name */}
                          <td
                            className={`sticky left-0 z-20 transition-colors duration-150 px-4 py-3 border-r border-zinc-200/80 dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.4)] ${
                              isRowHovered
                                ? "bg-indigo-50/90 dark:bg-indigo-950/70"
                                : "bg-white dark:bg-[#111827]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2.5">
                              <div
                                onClick={() => setSelectedStudentId(st.student_id)}
                                className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
                                title="Click to view full student profile"
                              >
                                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                  {st.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-zinc-900 dark:text-white truncate text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                    {st.full_name}
                                  </p>
                                  <p className="text-[10px] text-zinc-400 font-mono truncate">
                                    @{st.username}
                                  </p>
                                </div>
                              </div>

                              {/* Student Overall % Circle / Pill */}
                              <span
                                className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full border tabular-nums shrink-0 ${
                                  st.overall_completion_percentage >= 80
                                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                    : st.overall_completion_percentage >= 50
                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800"
                                }`}
                              >
                                {st.overall_completion_percentage}%
                              </span>
                            </div>
                          </td>

                          {/* Matrix Intersection Cells */}
                          {cohortDetail.assignments.map((col) => {
                            const overview = st.assignments.find((a) => a.assignment_id === col.id);
                            const isCellHovered =
                              hoveredCell?.studentId === st.student_id &&
                              hoveredCell?.assignmentId === col.id;
                            const isColHovered = hoveredCell?.assignmentId === col.id;

                            // Determine status badge
                            let cellElement: React.ReactNode = null;

                            if (overview?.has_submission) {
                              if (overview.status === "late") {
                                cellElement = (
                                  <button
                                    type="button"
                                    onClick={() => handleCellClick(st, col, overview)}
                                    className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60 font-semibold font-mono text-[11px] shadow-2xs hover:scale-[1.02] active:scale-95 transition-all"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>LATE</span>
                                    {overview.score !== null && (
                                      <span className="bg-amber-200/70 dark:bg-amber-900/60 px-1 py-0.2 rounded text-[10px]">
                                        {overview.score}/10
                                      </span>
                                    )}
                                  </button>
                                );
                              } else if (overview.score !== null && overview.score !== undefined) {
                                cellElement = (
                                  <button
                                    type="button"
                                    onClick={() => handleCellClick(st, col, overview)}
                                    className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60 font-semibold font-mono text-[11px] shadow-2xs hover:scale-[1.02] active:scale-95 transition-all"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>DONE</span>
                                    <span className="bg-emerald-200/70 dark:bg-emerald-900/60 px-1 py-0.2 rounded text-[10px]">
                                      {overview.score}/10
                                    </span>
                                  </button>
                                );
                              } else {
                                cellElement = (
                                  <button
                                    type="button"
                                    onClick={() => handleCellClick(st, col, overview)}
                                    className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60 font-semibold font-mono text-[11px] shadow-2xs hover:scale-[1.02] active:scale-95 transition-all"
                                  >
                                    <Clock className="w-3 h-3 text-sky-500 animate-pulse shrink-0" />
                                    <span>REVIEW</span>
                                  </button>
                                );
                              }
                            } else if (overview?.is_locked) {
                              cellElement = (
                                <button
                                  type="button"
                                  onClick={() => handleCellClick(st, col, overview)}
                                  className="w-full flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-zinc-100 text-zinc-400 border border-dashed border-zinc-300 dark:bg-zinc-900 dark:text-zinc-600 dark:border-zinc-800 font-medium font-mono text-[10px] hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition"
                                  title="Prerequisite lock active. Click to override and unlock."
                                >
                                  <Lock className="w-2.5 h-2.5 shrink-0" />
                                  <span>LOCKED</span>
                                </button>
                              );
                            } else {
                              cellElement = (
                                <div
                                  onClick={() => handleCellClick(st, col, overview)}
                                  className="w-full flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-zinc-100/80 text-zinc-400 border border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-500 dark:border-zinc-800 font-medium font-mono text-[10px] cursor-pointer hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition"
                                  title={`No submission yet from ${st.full_name}`}
                                >
                                  <XCircle className="w-2.5 h-2.5 shrink-0" />
                                  <span>NOT YET</span>
                                </div>
                              );
                            }

                            return (
                              <td
                                key={col.id}
                                onMouseEnter={() =>
                                  setHoveredCell({ studentId: st.student_id, assignmentId: col.id })
                                }
                                onMouseLeave={() => setHoveredCell(null)}
                                className={`px-2.5 py-2.5 text-center border-r border-zinc-200/80 dark:border-zinc-800 transition-colors duration-150 ${
                                  isCellHovered
                                    ? "bg-indigo-100/60 dark:bg-indigo-900/40 ring-1 ring-indigo-500/50"
                                    : isColHovered
                                    ? "bg-indigo-50/30 dark:bg-indigo-950/20"
                                    : ""
                                }`}
                              >
                                {cellElement}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DIRECTORY LIST VIEW (Original Student Table with Edits & Reset Pass) */}
      {/* ========================================================================= */}
      {activeTab === "all" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              className="input max-w-xs"
              placeholder="Search by name or username..."
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
            <select
              className="input max-w-[180px]"
              value={groupFilter}
              onChange={(e) => {
                setPage(1);
                setGroupFilter(e.target.value);
              }}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="card overflow-x-auto">
            {isLoadingDirectory ? (
              <LoadingRows rows={8} />
            ) : students.length === 0 ? (
              <EmptyState title="No students found" description="Try adjusting your search or filters." />
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                      <th className="py-2.5 px-3 font-medium">Name</th>
                      <th className="py-2.5 px-3 font-medium">Username</th>
                      <th className="py-2.5 px-3 font-medium">Telegram</th>
                      <th className="py-2.5 px-3 font-medium">Group</th>
                      <th className="py-2.5 px-3 font-medium">Level</th>
                      <th className="py-2.5 px-3 font-medium text-center">Stars</th>
                      <th className="py-2.5 px-3 font-medium text-center">Lightning</th>
                      <th className="py-2.5 px-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td
                          className="py-3 px-3 font-medium text-zinc-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer underline decoration-dotted"
                          onClick={() => setSelectedStudentId(s.id)}
                        >
                          {s.full_name}
                        </td>
                        <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
                          {s.username || s.email}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <TelegramLink username={s.telegram_username || s.phone} />
                        </td>
                        <td className="py-3 px-3 text-zinc-600 dark:text-zinc-300 font-medium text-xs">
                          {s.group_name ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 capitalize text-xs">
                          {s.level?.replace("_", " ") ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-center font-bold font-mono text-amber-500 text-xs tabular-nums">
                          +{s.total_stars} ⭐
                        </td>
                        <td className="py-3 px-3 text-center font-bold font-mono text-yellow-500 text-xs tabular-nums">
                          ⚡ {s.total_lightning ?? 0}
                        </td>
                        <td className="py-3 px-3 space-x-2 whitespace-nowrap">
                          <button
                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                            onClick={() => setEditing(s)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
                            onClick={() => setResettingStudent(s)}
                          >
                            Reset Pass
                          </button>
                          <button
                            className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
                            onClick={() => handleDelete(s)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>
                    Page {page} of {directoryTotalPages}
                  </span>
                  <div className="space-x-2">
                    <button
                      className="btn-secondary text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      disabled={page >= directoryTotalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PENDING APPROVALS QUEUE */}
      {/* ========================================================================= */}
      {activeTab === "pending" && (
        <div className="card overflow-x-auto">
          {isLoadingPending ? (
            <LoadingRows rows={4} />
          ) : pendingStudents.length === 0 ? (
            <EmptyState
              title="No pending requests"
              description="New student registrations requiring teacher approval will show up here."
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <th className="py-2.5 px-3 font-medium">Name</th>
                    <th className="py-2.5 px-3 font-medium">Username</th>
                    <th className="py-2.5 px-3 font-medium">Telegram</th>
                    <th className="py-2.5 px-3 font-medium">Group</th>
                    <th className="py-2.5 px-3 font-medium">Level</th>
                    <th className="py-2.5 px-3 font-medium">Registered</th>
                    <th className="py-2.5 px-3 font-medium text-right">Approval Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingStudents.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3 px-3 font-medium text-zinc-900 dark:text-white">
                        {`${s.first_name || ""} ${s.last_name || ""}`.trim() || s.username}
                      </td>
                      <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
                        {s.username}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <TelegramLink username={s.telegram_username} />
                      </td>
                      <td className="py-3 px-3 font-medium text-indigo-600 dark:text-indigo-400 text-xs">
                        {s.group_name ?? "—"}
                      </td>
                      <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 capitalize text-xs">
                        {s.english_level?.replace("_", " ") ?? "—"}
                      </td>
                      <td className="py-3 px-3 text-zinc-400 dark:text-zinc-500 text-xs font-mono">
                        {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <button
                          disabled={submittingIds[s.id]}
                          className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded hover:bg-emerald-700 disabled:opacity-50 transition"
                          onClick={() => onApprove(s)}
                        >
                          {submittingIds[s.id] ? "..." : "✓ Approve"}
                        </button>
                        <button
                          disabled={submittingIds[s.id]}
                          className="px-3 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 transition border border-rose-200 dark:border-rose-800"
                          onClick={() => onReject(s)}
                        >
                          {submittingIds[s.id] ? "..." : "✕ Reject"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination Controls */}
              <div className="flex flex-wrap items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-4 gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Students per page:</span>
                  <select
                    value={pendingPageSize}
                    onChange={(e) => {
                      const newSize = Math.min(100, Math.max(1, Number(e.target.value)));
                      setPendingPageSize(newSize);
                      setPendingPage(1);
                    }}
                    className="border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-xs bg-white dark:bg-[#0D1117] text-zinc-900 dark:text-zinc-100"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Page {pendingPage} of {Math.max(1, pendingTotalPages)} ({pendingTotal} pending)
                  </span>
                  <div className="flex gap-1">
                    <button
                      disabled={pendingPage <= 1}
                      onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={pendingPage >= pendingTotalPages || pendingTotalPages === 0}
                      onClick={() => setPendingPage((p) => p + 1)}
                      className="px-2.5 py-1 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 1-Click Quick Inspection Drawer */}
      <SubmissionReviewDrawer
        submissionId={selectedSubmissionId}
        onClose={() => setSelectedSubmissionId(null)}
        onGraded={handleGradedUpdate}
      />

      {/* Student Profile Detail Modal */}
      <StudentDetailModal
        studentId={selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
      />

      {/* Edit Student Modal */}
      <EditStudentModal
        student={editing}
        groups={groups}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refreshDirectory();
          if (selectedCohortId) loadCohortMatrix(selectedCohortId);
        }}
      />

      {/* Reset Password Modal */}
      <ResetStudentPasswordModal
        student={resettingStudent}
        onClose={() => setResettingStudent(null)}
      />

      <ConfirmDialog />
    </div>
  );
}

function ResetStudentPasswordModal({
  student,
  onClose,
}: {
  student: StudentListItem | null;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNewPassword("");
    setConfirmPassword("");
  }, [student]);

  if (!student) return null;

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await resetStudentPassword(student!.id, newPassword);
      toast.success(res.message || "Password reset successfully!");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal open={!!student} onClose={onClose} title={`Reset Password: ${student.full_name}`}>
      <form onSubmit={handleReset} className="space-y-4 text-sm">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Set a new password for <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{student.full_name}</strong> (@{student.username || student.email}).
          Their active sessions will be invalidated and they can immediately login with this password.
        </p>

        <div>
          <label className="label">New Temporary Password *</label>
          <input
            type="password"
            required
            minLength={6}
            className="input"
            placeholder="At least 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Confirm New Password *</label>
          <input
            type="password"
            required
            minLength={6}
            className="input"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? "Resetting..." : "Set Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditStudentModal({
  student,
  groups,
  onClose,
  onSaved,
}: {
  student: StudentListItem | null;
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setFullName(student.full_name);
      setPhone(student.phone ?? "");
      setGroupId(groups.find((g) => g.name === student.group_name)?.id ?? "");
    }
  }, [student, groups]);

  if (!student) return null;

  async function save() {
    setIsSaving(true);
    try {
      await updateStudent(student!.id, {
        full_name: fullName,
        phone: phone || undefined,
        group_id: groupId || null,
      });
      toast.success("Student updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update student");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={!!student} onClose={onClose} title="Edit Student">
      <div className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Telegram Contact</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="@username or +998..."
          />
        </div>
        <div>
          <label className="label">Group</label>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={isSaving} onClick={save}>
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

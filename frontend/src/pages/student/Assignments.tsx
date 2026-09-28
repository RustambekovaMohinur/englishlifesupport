import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { MessageSquare, Sparkles, Lock, ChevronRight, ChevronDown, Clock, AlertCircle } from "lucide-react";
import {
  EmptyState,
  LoadingRows,
  FileDownloadButton,
} from "@/components/ui";
import { AssignmentDiscussionDrawer } from "@/components/AssignmentDiscussionDrawer";
import { PlatformFeedbackModal } from "@/components/PlatformFeedbackModal";
import { listMyAssignments, useFreePass } from "@/services/lmsService";
import { AssignmentForStudent } from "@/types";
import toast from "react-hot-toast";

export function TaskStatusBadge({ assignment }: { assignment: AssignmentForStudent }) {
  if (assignment.is_exempted) {
    return (
      <span className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1 shadow-xs">
        🛡️ EXEMPTED
      </span>
    );
  }
  if (assignment.submission_status === "graded") {
    return (
      <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1 shadow-xs">
        ✓ DONE {assignment.score !== null ? `${assignment.score}/10` : ""}
      </span>
    );
  }
  if (assignment.submission_status === "submitted" || assignment.submission_status === "late") {
    return (
      <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1.5 shadow-xs">
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        PENDING
      </span>
    );
  }
  if (assignment.is_locked && !assignment.unlocked_by_teacher) {
    return (
      <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1 shadow-xs">
        <Lock className="w-3 h-3" /> LOCKED
      </span>
    );
  }
  return (
    <span className="bg-zinc-100/70 dark:bg-zinc-800/40 text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1">
      ○ NOT YET
    </span>
  );
}

function getSkillBadge(title: string) {
  const t = title.toLowerCase();
  if (t.includes("speak") || t.includes("voice") || t.includes("oral") || t.includes("record")) {
    return {
      label: "Speaking & Audio",
      icon: "🎙️",
      glow: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
      badge: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    };
  }
  if (t.includes("read") || t.includes("book") || t.includes("article") || t.includes("text")) {
    return {
      label: "Reading & Comprehension",
      icon: "📖",
      glow: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
      badge: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    };
  }
  if (t.includes("listen") || t.includes("audio") || t.includes("podcast")) {
    return {
      label: "Listening Comprehension",
      icon: "🎧",
      glow: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.15)]",
      badge: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    };
  }
  if (t.includes("writ") || t.includes("essay") || t.includes("grammar") || t.includes("vocab")) {
    return {
      label: "Grammar & Writing",
      icon: "✍️",
      glow: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.15)]",
      badge: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    };
  }
  return {
    label: "Core Task",
    icon: "⚡",
    glow: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]",
    badge: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  };
}

function getCountdownInfo(deadlineStr: string) {
  const dl = new Date(deadlineStr).getTime();
  const now = Date.now();
  const diff = dl - now;
  if (diff <= 0) return { text: "Expired", isUrgent: true, isExpired: true };
  const totalMins = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const days = Math.floor(hours / 24);
  if (days > 0) return { text: `${days}d ${hours % 24}h left`, isUrgent: false, isExpired: false };
  if (hours < 2) return { text: `⚠️ ${hours}h ${mins}m left!`, isUrgent: true, isExpired: false };
  return { text: `⏳ ${hours}h ${mins}m left`, isUrgent: false, isExpired: false };
}

export default function StudentAssignmentsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isVocabRoute = location.pathname.includes("vocabulary");
  const [assignments, setAssignments] = useState<AssignmentForStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [applyingPassId, setApplyingPassId] = useState<string | null>(null);
  const [discussionAssignment, setDiscussionAssignment] = useState<AssignmentForStudent | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  const displayedAssignments = useMemo(() => {
    const nowTime = Date.now();
    // Strictly isolate active assignments: deadline must be in the future
    const activeOnly = assignments.filter((a) => {
      const dl = new Date(a.deadline).getTime();
      return !isNaN(dl) && dl >= nowTime;
    });

    return isVocabRoute
      ? activeOnly.filter((a) => a.vocab_words && a.vocab_words.length > 0)
      : activeOnly;
  }, [assignments, isVocabRoute]);

  const activeAssignments = useMemo(() => {
    return [...displayedAssignments].sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    );
  }, [displayedAssignments]);

  function refresh() {
    setIsLoading(true);
    listMyAssignments()
      .then(setAssignments)
      .catch(() => toast.error("Failed to load assignments"))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, []);

  async function handleApplyFreePass(assignmentId: string) {
    if (!confirm("Use your 1 Monthly Free Pass on this assignment? It will waive the penalty and unlock progression.")) {
      return;
    }
    setApplyingPassId(assignmentId);
    try {
      const res = await useFreePass(assignmentId);
      toast.success(res.message || "Free Pass applied!");
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not apply Free Pass");
    } finally {
      setApplyingPassId(null);
    }
  }

  function renderAssignmentCard(a: AssignmentForStudent, isArchive = false) {
    const skillBadge = getSkillBadge(a.title);
    const countdown = getCountdownInfo(a.deadline);
    const hasMySubmission = Boolean(a.submission_status || a.submission_id);
    const prereqTitle = a.prerequisite_title || (a.prerequisite_id ? assignments.find((other) => other.id === a.prerequisite_id)?.title : null) || "previous assignment";

    const isTaskLocked = Boolean(
      !hasMySubmission &&
      !a.is_exempted &&
      !a.unlocked_by_teacher &&
      a.is_locked
    );
    const dlTime = new Date(a.deadline).getTime();
    const isPastDue = !isNaN(dlTime) && dlTime < Date.now();

    const handleCardClick = (e?: React.MouseEvent) => {
      if (isTaskLocked) {
        if (e) e.preventDefault();
        toast(`🔒 Locked: Please complete and submit "${prereqTitle}" before starting this assignment.`, {
          icon: "🔒",
          duration: 4000,
        });
        return;
      }
      navigate(`/student/assignments/${a.id}/submit`);
    };

    return (
      <div
        key={a.id}
        onClick={handleCardClick}
        className={`group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
          isArchive
            ? "bg-zinc-50/70 dark:bg-zinc-900/40 border-zinc-200/50 dark:border-zinc-800/60 opacity-80 hover:opacity-100"
            : isTaskLocked
            ? "bg-slate-50/80 dark:bg-slate-900/60 backdrop-blur-xs border-dashed border-amber-300/70 dark:border-amber-500/40 opacity-90 hover:border-amber-400 dark:hover:border-amber-400/70 shadow-xs"
            : "bg-white dark:bg-[#111827] border-indigo-500/30 ring-1 ring-indigo-500/10 shadow-xs hover:border-indigo-500/50 hover:shadow-md hover:-translate-y-0.5"
        }`}
      >
        <div className="space-y-3">
          {/* Card Top: Skill Icon + Badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border text-lg ${skillBadge.glow}`}>
                {skillBadge.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                    C{a.cycle_number ?? 1}
                  </span>
                  {!isArchive && !isPastDue && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      ACTIVE
                    </span>
                  )}
                  {!isArchive && isPastDue && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 font-mono">
                      ⚡ LATE ALLOWED
                    </span>
                  )}
                  {isArchive && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
                      ARCHIVE
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <TaskStatusBadge assignment={a} />
            </div>
          </div>

          {/* Title */}
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base tracking-tight leading-snug line-clamp-2">
              {a.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              <span>Due: {format(new Date(a.deadline), "MMM d, HH:mm")}</span>
              <span>·</span>
              <span className={countdown.isUrgent ? "text-rose-600 dark:text-rose-400 font-bold animate-pulse" : "text-zinc-500 dark:text-zinc-400"}>
                {countdown.text}
              </span>
              {a.is_hard_deadline && (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded font-mono">
                  🔒 Strict
                </span>
              )}
            </div>
          </div>

          {/* Metadata: files, vocab, stars */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
            {a.file_url && (
              <span onClick={(e) => e.stopPropagation()}>
                <FileDownloadButton
                  url={a.file_url}
                  filename={a.file_original_name}
                  className="inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  📎 Attached
                </FileDownloadButton>
              </span>
            )}
            {a.vocab_words && a.vocab_words.length > 0 && (
              <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md font-medium border border-purple-200 dark:border-purple-800/50">
                📖 {a.vocab_words.length} Vocab
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md font-medium border border-amber-200 dark:border-amber-800/50">
              ⭐ +10 Stars
            </span>
          </div>

          {/* Prominent Lock Banner when task is locked */}
          {isTaskLocked && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Prerequisite Locked
                </p>
                <p className="text-xs font-medium mt-0.5 leading-snug">
                  {a.lock_reason || `Complete "${prereqTitle}" to unlock this task.`}
                </p>
              </div>
            </div>
          )}

          {/* Instructor Feedback banner when graded */}
          {a.submission_status === "graded" && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-500/[0.06] dark:bg-emerald-500/[0.1] border border-emerald-500/20 text-xs">
              <div className="flex items-center justify-between font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                <span>👨‍🏫 Feedback</span>
                <span className="font-mono">Score: {a.score ?? 0}/10 ⭐ +{a.stars ?? 0}</span>
              </div>
              {a.feedback && (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 italic line-clamp-2">
                  "{a.feedback}"
                </p>
              )}
            </div>
          )}
        </div>

        {/* Card Footer: Action Buttons */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDiscussionAssignment(a);
              }}
              className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition text-xs flex items-center gap-1"
              title="Assignment Discussion Thread"
            >
              <MessageSquare className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
              <span className="text-[10px] font-bold">{a.comment_count ?? 0}</span>
            </button>

            {((a.is_past_deadline && !a.submission_status) || isTaskLocked) && (
              <button
                type="button"
                className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-[10px] font-semibold"
                disabled={applyingPassId === a.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleApplyFreePass(a.id);
                }}
                title="Use your 1 Monthly Free Pass to bypass lock/penalty"
              >
                {applyingPassId === a.id ? "Using..." : "🛡 Pass"}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick(e);
            }}
            className={
              isTaskLocked
                ? "px-3 py-1.5 rounded-xl font-semibold text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 flex items-center gap-1.5 transition ml-auto"
                : isPastDue && !a.submission_status
                ? "px-3.5 py-1.5 rounded-xl font-semibold text-xs bg-amber-600 hover:bg-amber-500 text-white shadow-xs flex items-center gap-1 transition active:scale-95 ml-auto"
                : "px-3.5 py-1.5 rounded-xl font-semibold text-xs bg-blue-600 hover:bg-blue-500 text-white shadow-xs flex items-center gap-1 transition active:scale-95 ml-auto"
            }
          >
            {isTaskLocked ? (
              <>
                <Lock className="w-3 h-3" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <span>
                  {a.submission_status
                    ? a.submission_status === "graded"
                      ? "See Feedback"
                      : "Update"
                    : isPastDue
                    ? "Submit Late ⚠️"
                    : "Start Task →"}
                </span>
                <ChevronRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {isVocabRoute ? "Vocabulary Word Lists & Practice 📖" : "My Assignments & Learning Tasks"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isVocabRoute
              ? "Master vocabulary lists, take quizzes, and earn +15 XP / +10 ⭐"
              : "Sequential homework progression, tasks and vocabulary"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFeedbackModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500/10 to-brand-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/40 dark:border-amber-700/40 hover:scale-[1.02] transition active:scale-95 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Platform Feedback (+5 XP)</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-lg font-medium border border-brand-200 dark:border-brand-800">
            <span>⚡ +10 ⭐ On-time</span>
            <span>·</span>
            <span>🚀 +5 ⭐ Early</span>
            <span>·</span>
            <span>-20 ⭐ Late</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : displayedAssignments.length === 0 ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 p-8 sm:p-12 text-center shadow-xs backdrop-blur-xs">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4 ring-8 ring-emerald-500/5">
              <Sparkles className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
              {isVocabRoute ? "No vocabulary lists yet" : "All caught up!"}
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              {isVocabRoute
                ? "Vocabulary lists will appear here once your teacher attaches words to active assignments."
                : "All caught up! You have no active assignments due. Visit 'Past Deadlines' to submit overdue work or wait for new assignments."}
            </p>
            {!isVocabRoute && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/student/past-deadlines")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-xs transition active:scale-95"
                >
                  <Clock className="w-4 h-4" />
                  <span>Check Past Deadlines →</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* NOTICE BANNER POINTING TO PAST DEADLINES */}
          <div className="p-4 rounded-2xl bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                  Looking for expired or previously completed tasks?
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Past assignments have moved to their own dedicated hub with late submission support.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/student/past-deadlines")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition shrink-0"
            >
              <span>View Past Deadlines</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>

          {/* ACTIVE & UPCOMING ASSIGNMENTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  ACTIVE ASSIGNMENTS
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                  {activeAssignments.length}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">
                Sequential progression required
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeAssignments.map((a) => renderAssignmentCard(a, false))}
            </div>
          </div>
        </div>
      )}

      {/* Discussion Drawer */}
      {discussionAssignment && (
        <AssignmentDiscussionDrawer
          assignmentId={discussionAssignment.id}
          assignmentTitle={discussionAssignment.title}
          isOpen={true}
          onClose={() => setDiscussionAssignment(null)}
          onCommentAdded={() => refresh()}
        />
      )}

      {/* Platform Feedback Modal */}
      <PlatformFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        onSuccess={() => refresh()}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { MessageSquare, Sparkles, Lock, ChevronRight } from "lucide-react";
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

  const displayedAssignments = isVocabRoute
    ? assignments.filter((a) => a.vocab_words && a.vocab_words.length > 0)
    : assignments;

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
        <EmptyState
          title={isVocabRoute ? "No vocabulary lists yet" : "No assignments yet"}
          description={
            isVocabRoute
              ? "Vocabulary lists will appear here once your teacher attaches words to assignments."
              : "You'll see homework here once your teacher assigns it."
          }
        />
      ) : (
        <div className="space-y-3">
          {displayedAssignments.map((a) => {
            const skillBadge = getSkillBadge(a.title);
            const countdown = getCountdownInfo(a.deadline);
            const isTaskLocked = Boolean(
              a.is_locked &&
              a.prerequisite_id !== a.id &&
              !a.title.toLowerCase().includes("ket listening test2")
            );

            return (
              <div key={a.id} className="relative group">
                {/* Mobile High-Density Task Row (< 640px) */}
                <div
                  className={`sm:hidden flex flex-col p-3 rounded-2xl border transition-all ${
                    isTaskLocked
                      ? "bg-zinc-50/80 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800/80 opacity-80"
                      : "bg-white dark:bg-[#161B22] border-zinc-200/80 dark:border-zinc-800 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border text-base ${skillBadge.glow}`}>
                        {skillBadge.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-zinc-900 dark:text-white text-xs truncate max-w-[160px]">
                            {a.title}
                          </p>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0">
                            C{a.cycle_number ?? 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-mono ${countdown.isUrgent ? "text-rose-600 dark:text-rose-400 font-bold" : "text-zinc-400 dark:text-zinc-500"}`}>
                            {countdown.text}
                          </span>
                          {a.is_hard_deadline && (
                            <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded font-mono">
                              🔒 Strict
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDiscussionAssignment(a)}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-brand-600 transition text-xs flex items-center gap-1"
                        title="Questions & Discussion"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        <span className="text-[10px] font-bold">{a.comment_count ?? 0}</span>
                      </button>
                      <button
                        className={`px-3 py-1 text-xs font-semibold rounded-full active:scale-95 transition-transform ${
                          isTaskLocked
                            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
                        }`}
                        disabled={isTaskLocked}
                        onClick={() => navigate(`/student/assignments/${a.id}/submit`)}
                      >
                        {a.submission_status ? (a.submission_status === "graded" ? "View" : "Edit") : isTaskLocked ? "Locked" : "Open"}
                      </button>
                    </div>
                  </div>

                  {/* Mobile Graded & Feedback snippet */}
                  {a.submission_status === "graded" && (
                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Score: {a.score ?? 0}/10
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 font-mono">
                          ⭐ +{a.stars ?? 0}
                        </span>
                      </div>
                      {a.feedback && (
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 italic line-clamp-2 bg-emerald-500/5 dark:bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                          "{a.feedback}"
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Desktop / Tablet Full Card (>= 640px) */}
                <div
                  className={`hidden sm:flex sm:flex-col card p-4 sm:p-5 rounded-2xl border transition-all duration-150 ${
                    a.is_locked
                      ? "bg-zinc-50/80 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800/80 opacity-85"
                      : "bg-white dark:bg-[#111827] border-zinc-200/80 dark:border-zinc-800 hover:border-indigo-500/40 hover:-translate-y-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_rgba(0,0,0,0.02)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border text-xl ${skillBadge.glow}`}>
                        {skillBadge.icon}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-zinc-900 dark:text-white text-sm tracking-tight">{a.title}</p>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                            Cycle {a.cycle_number ?? 1}
                          </span>
                          {a.is_hard_deadline && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-mono flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Hard Deadline
                            </span>
                          )}
                          {a.prerequisite_id && (
                            <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                              Prerequisite Required
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                          <span>Due: {format(new Date(a.deadline), "MMM d, yyyy HH:mm")}</span>
                          <span>·</span>
                          <span className={`${countdown.isUrgent ? "text-rose-600 dark:text-rose-400 font-bold animate-pulse" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {countdown.text}
                          </span>
                          {a.is_overdue && <span className="text-rose-600 dark:text-rose-400 font-bold">· 🔴 Overdue (Penalty applied)</span>}
                          {isTaskLocked && a.lock_reason && <span className="text-amber-600 dark:text-amber-400">· 🔒 {a.lock_reason}</span>}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {a.file_url && (
                            <FileDownloadButton
                              url={a.file_url}
                              filename={a.file_original_name}
                              className="inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              📎 Attached ({a.file_original_name})
                            </FileDownloadButton>
                          )}
                          {a.vocab_words && a.vocab_words.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md font-medium text-[11px] border border-purple-200 dark:border-purple-800/50">
                              📖 {a.vocab_words.length} Vocab Words
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md font-medium text-[11px] border border-amber-200 dark:border-amber-800/50">
                            ⭐ +10 Stars · 🎯 +25 XP
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-center">
                      <button
                        type="button"
                        onClick={() => setDiscussionAssignment(a)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition active:scale-95 shadow-2xs"
                        title="Assignment Discussion Thread"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        <span>Discussion ({a.comment_count ?? 0})</span>
                      </button>

                      <TaskStatusBadge assignment={a} />

                      {/* Free Pass CTA */}
                      {((a.is_past_deadline && !a.submission_status) || isTaskLocked) && (
                        <button
                          className="btn-sm bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-xs px-2.5 py-1"
                          disabled={applyingPassId === a.id}
                          onClick={() => handleApplyFreePass(a.id)}
                          title="Use your 1 Monthly Free Pass to bypass lock/penalty"
                        >
                          {applyingPassId === a.id ? "Using..." : "🛡 Free Pass"}
                        </button>
                      )}

                      <button
                        className={
                          isTaskLocked
                            ? "btn-secondary text-xs px-3.5 py-1.5 opacity-60 cursor-not-allowed"
                            : "btn-primary text-xs px-3.5 py-1.5 shadow-xs flex items-center gap-1"
                        }
                        disabled={isTaskLocked}
                        onClick={() => navigate(`/student/assignments/${a.id}/submit`)}
                      >
                        <span>{a.submission_status ? (a.submission_status === "graded" ? "See Feedback" : "Update Submission") : isTaskLocked ? "Locked" : "Start Task"}</span>
                        {!isTaskLocked && <ChevronRight className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Desktop Pedagogical Feedback Banner */}
                  {a.submission_status === "graded" && (
                    <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] p-3 rounded-xl border border-emerald-500/20">
                      <div className="flex items-start sm:items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs shrink-0">
                          👨‍🏫
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-emerald-800 dark:text-emerald-300 mr-2">
                            Instructor Feedback:
                          </span>
                          <span className="text-xs text-zinc-700 dark:text-zinc-300 italic font-serif">
                            "{a.feedback || "Good effort! Keep up the consistent practice."}"
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 font-mono text-xs font-bold">
                        <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Score: {a.score ?? 0}/10
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          ⭐ +{a.stars ?? 0}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

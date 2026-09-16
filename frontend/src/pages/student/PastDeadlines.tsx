import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Lock,
  ArrowRight,
  RefreshCw,
  FileText,
  ExternalLink,
} from "lucide-react";
import { EmptyState, LoadingRows, FileDownloadButton } from "@/components/ui";
import { AssignmentDiscussionDrawer } from "@/components/AssignmentDiscussionDrawer";
import { listPastDeadlineAssignments, useFreePass } from "@/services/lmsService";
import { AssignmentForStudent } from "@/types";
import toast from "react-hot-toast";

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

export default function PastDeadlinesPage() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<AssignmentForStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "missing" | "submitted">("all");
  const [applyingPassId, setApplyingPassId] = useState<string | null>(null);
  const [discussionAssignment, setDiscussionAssignment] = useState<AssignmentForStudent | null>(null);

  function refresh() {
    setIsLoading(true);
    listPastDeadlineAssignments()
      .then(setAssignments)
      .catch(() => toast.error("Failed to load past deadline assignments"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleApplyFreePass(assignmentId: string) {
    if (!confirm("Use your 1 Monthly Free Pass on this overdue assignment? It will waive the penalty and unlock progression.")) {
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

  // Filter lists
  const missingAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const isMissing = !a.submission_status && !a.submission_id;
      return isMissing || a.detailed_status === "OVERDUE / PENDING_LATE";
    });
  }, [assignments]);

  const submittedAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const hasSub = Boolean(a.submission_status || a.submission_id);
      return hasSub && a.detailed_status !== "OVERDUE / PENDING_LATE";
    });
  }, [assignments]);

  const displayedList = useMemo(() => {
    if (activeTab === "missing") return missingAssignments;
    if (activeTab === "submitted") return submittedAssignments;
    return assignments;
  }, [activeTab, assignments, missingAssignments, submittedAssignments]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="rounded-3xl border border-rose-200/70 dark:border-rose-900/50 bg-gradient-to-r from-rose-50/80 via-white to-amber-50/60 dark:from-rose-950/25 dark:via-zinc-900 dark:to-amber-950/20 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                <Clock className="w-3.5 h-3.5" />
                Past Deadlines Hub
              </span>
              {missingAssignments.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white font-mono shadow-xs">
                  {missingAssignments.length} Missing
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              Missed & Past Coursework
            </h1>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Assignments whose initial deadlines have elapsed. You can still submit overdue homework at any time to catch up on curriculum requirements and restore progress. Overdue submissions will be flagged as late for your instructor.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-3 rounded-2xl bg-white/90 dark:bg-zinc-800/90 border border-zinc-200/70 dark:border-zinc-700 text-center shadow-xs">
              <span className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Total Past</span>
              <span className="block text-xl font-bold font-mono text-zinc-900 dark:text-white mt-0.5">
                {assignments.length}
              </span>
            </div>
            <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-center shadow-xs">
              <span className="block text-[11px] font-semibold text-rose-700 dark:text-rose-300">Action Needed</span>
              <span className="block text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                {missingAssignments.length}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === "all"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                : "bg-white/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700"
            }`}
          >
            All Past Tasks ({assignments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("missing")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "missing"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-white/80 dark:bg-zinc-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Missing / Action Required ({missingAssignments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("submitted")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "submitted"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white/80 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Submitted & Graded ({submittedAssignments.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <LoadingRows rows={4} />
      ) : displayedList.length === 0 ? (
        <EmptyState
          title={
            activeTab === "missing"
              ? "No missing homework!"
              : activeTab === "submitted"
              ? "No submitted past tasks yet"
              : "No expired assignments"
          }
          description={
            activeTab === "missing"
              ? "You have submitted all past assignments! Keep up the great work."
              : "Assignments with elapsed deadlines will be organized here."
          }
          action={
            <button
              type="button"
              onClick={() => navigate("/student/assignments")}
              className="btn-primary text-xs"
            >
              View Active Tasks →
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedList.map((a) => {
            const skillBadge = getSkillBadge(a.title);
            const isMissing = !a.submission_status && !a.submission_id;
            const isLateSubmission =
              a.detailed_status === "SUBMITTED_LATE" ||
              a.submission_status === "late" ||
              (a.submission_status && a.is_past_deadline && a.detailed_status !== "COMPLETED_ON_TIME");
            const isCompletedOnTime =
              a.detailed_status === "COMPLETED_ON_TIME" ||
              (!isLateSubmission && (a.submission_status === "graded" || a.submission_status === "submitted"));

            return (
              <div
                key={a.id}
                className={`rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                  isMissing
                    ? "bg-white dark:bg-[#161B22] border-rose-200 dark:border-rose-900/60 shadow-xs hover:border-rose-400"
                    : "bg-white dark:bg-[#161B22] border-zinc-200 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div>
                  {/* Top Bar: Skill & Deadline Highlight */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${skillBadge.badge}`}>
                        <span>{skillBadge.icon}</span>
                        <span>{skillBadge.label}</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        Cycle {a.cycle_number ?? 1}
                      </span>
                    </div>

                    {/* Due Date: Highlighted in Red */}
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800/60 font-mono shrink-0">
                      Expired on {format(new Date(a.deadline), "MMM d, HH:mm")}
                    </span>
                  </div>

                  {/* Title & Status Indicator */}
                  <div className="mb-2">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 transition">
                      {a.title}
                    </h3>
                  </div>

                  {/* Status Indicator Badge (Prompt Spec) */}
                  <div className="mb-3">
                    {isMissing ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>Missing / Action Required</span>
                      </span>
                    ) : isLateSubmission ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-mono">
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Submitted (Late)</span>
                      </span>
                    ) : isCompletedOnTime ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Completed (On-time)</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Description / Instructions Snippet */}
                  {(() => {
                    let descText = a.description;
                    try {
                      const parsed = JSON.parse(a.description);
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        descText = parsed.map((p: any) => p.content || p.type).filter(Boolean).join(" • ");
                      }
                    } catch {}
                    return (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4">
                        {descText || "No additional instructions provided."}
                      </p>
                    );
                  })()}

                  {/* Vocabulary & Materials Row */}
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    {a.vocab_words && a.vocab_words.length > 0 && (
                      <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-0.5 rounded-lg border border-purple-200 dark:border-purple-800">
                        📖 {a.vocab_words.length} Vocabulary Words
                      </span>
                    )}
                    {a.file_url && (
                      <FileDownloadButton
                        url={a.file_url}
                        filename={a.file_original_name}
                        className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1 hover:underline"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Teacher Attached File</span>
                      </FileDownloadButton>
                    )}
                  </div>

                  {/* Submission Grade / Feedback details if evaluated */}
                  {a.score !== null && (
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-1 mb-4">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-zinc-700 dark:text-zinc-300">Instructor Evaluation:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                          Score: {a.score} / 10 {a.stars !== null ? `(⭐ +${a.stars})` : ""}
                        </span>
                      </div>
                      {a.feedback && (
                        <p className="text-zinc-600 dark:text-zinc-400 italic">
                          &ldquo;{a.feedback}&rdquo;
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscussionAssignment(a)}
                    className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1 text-xs font-semibold"
                    title="Questions & Discussion"
                  >
                    <MessageSquare className="w-4 h-4 text-indigo-500" />
                    <span>Savollar</span>
                    {(a.comment_count ?? 0) > 0 && (
                      <span className="font-mono text-[10px] text-zinc-400">({a.comment_count})</span>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    {/* Free Pass Button if task is locked/overdue */}
                    {isMissing && (
                      <button
                        type="button"
                        onClick={() => handleApplyFreePass(a.id)}
                        disabled={applyingPassId === a.id}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition flex items-center gap-1 shadow-2xs"
                        title="Use 1 Monthly Free Pass to waive late penalty"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Free Pass</span>
                      </button>
                    )}

                    {/* Direct Submission Button */}
                    <button
                      type="button"
                      onClick={() => navigate(`/student/assignments/${a.id}/submit`)}
                      className={`btn-sm text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-xs flex items-center gap-1.5 ${
                        isMissing
                          ? "bg-rose-600 hover:bg-rose-700 active:scale-95 text-white"
                          : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white"
                      }`}
                    >
                      <span>{isMissing ? "Submit Overdue Homework" : "View / Resubmit"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
    </div>
  );
}

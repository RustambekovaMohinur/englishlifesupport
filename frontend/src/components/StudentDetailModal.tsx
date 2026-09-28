import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { ChevronDown, History, BookOpen, Layers, Trophy, Clock, CheckCircle2, Lock, Unlock, Zap } from "lucide-react";
import { FileDownloadButton, LoadingRows, Modal, Spinner, TelegramLink } from "@/components/ui";
import { getStudent, getStudentHistory, listGroups, listSubmissions, resetStudentPassword, updateStudentPlacement, unlockStudentUpToDate, toggleStudentAssignmentLock, sendParentDigest } from "@/services/lmsService";
import { Group, StudentHistoryOut, StudentOut, SubmissionOut, StudentWordlistProgressItem } from "@/types";
import { UserAvatar } from "@/components/common/UserAvatar";
import DuplicateCompareModal from "@/components/DuplicateCompareModal";

interface StudentDetailModalProps {
  studentId: string | null;
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onStudentUpdated?: () => void;
}

export default function StudentDetailModal({
  studentId,
  isOpen,
  open,
  onClose,
  onStudentUpdated,
}: StudentDetailModalProps) {
  const [profile, setProfile] = useState<StudentOut | null>(null);
  const [history, setHistory] = useState<StudentHistoryOut | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isPastCyclesOpen, setIsPastCyclesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"assignments" | "vocabulary" | "past">("assignments");
  const [isUnlockingUpToDate, setIsUnlockingUpToDate] = useState(false);
  const [togglingAssignmentId, setTogglingAssignmentId] = useState<string | null>(null);
  const [inspectingDuplicateSubmissionId, setInspectingDuplicateSubmissionId] = useState<string | null>(null);
  const [isSendingParentDigest, setIsSendingParentDigest] = useState(false);

  const isModalOpen = (isOpen ?? open) !== undefined ? Boolean(isOpen ?? open) : Boolean(studentId);

  async function handleUnlockUpToDate() {
    if (!studentId) return;
    setIsUnlockingUpToDate(true);
    try {
      const res = await unlockStudentUpToDate(studentId);
      toast.success(res.message || "Past assignments exempted! Student is up to date.");
      const hist = await getStudentHistory(studentId);
      setHistory(hist);
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to unlock assignments");
    } finally {
      setIsUnlockingUpToDate(false);
    }
  }

  async function handleSendParentReport() {
    if (!studentId) return;
    const isLinked = history?.is_parent_linked || profile?.is_parent_linked;
    if (!isLinked) {
      toast.error("Parent Telegram bot is not connected for this student.");
      return;
    }

    setIsSendingParentDigest(true);
    try {
      const res = await sendParentDigest(studentId);
      toast.success(res.message || "Report sent to parent successfully! 📩", { duration: 4000 });
      if (studentId) getStudentHistory(studentId).then(setHistory).catch(() => {});
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to send parent report");
    } finally {
      setIsSendingParentDigest(false);
    }
  }

  async function handleToggleLock(assignmentId: string, currentUnlocked?: boolean) {
    if (!studentId) return;
    setTogglingAssignmentId(assignmentId);
    try {
      const res = await toggleStudentAssignmentLock(studentId, assignmentId);
      toast.success(res.is_unlocked ? "Task unlocked for student!" : "Task locked.");
      const hist = await getStudentHistory(studentId);
      setHistory(hist);
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to toggle task lock");
    } finally {
      setTogglingAssignmentId(null);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsResetting(true);
    try {
      const res = await resetStudentPassword(studentId, newPassword);
      toast.success(res.message || "Password reset successfully!");
      setResetModalOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to reset password");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleQuickGroupChange(newGroupId: string) {
    if (!studentId) return;
    setIsUpdatingGroup(true);
    try {
      const updated = await updateStudentPlacement(studentId, newGroupId || null);
      setProfile(updated);
      toast.success("Student cohort updated successfully!");
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update cohort");
    } finally {
      setIsUpdatingGroup(false);
    }
  }

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    if (!studentId) {
      setProfile(null);
      setHistory(null);
      setSubmissions([]);
      setIsLoading(false);
      setHasError(false);
      setErrorMessage(null);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setHasError(false);
    setErrorMessage(null);

    Promise.allSettled([
      getStudent(studentId),
      getStudentHistory(studentId),
      listSubmissions({ student_id: studentId, page_size: 50 }),
    ])
      .then(([profRes, histRes, subsRes]) => {
        if (!isCurrent) return;

        let profLoaded = false;
        let histLoaded = false;

        if (profRes.status === "fulfilled" && profRes.value) {
          setProfile(profRes.value);
          profLoaded = true;
        }

        if (histRes.status === "fulfilled" && histRes.value) {
          setHistory(histRes.value);
          histLoaded = true;
        }

        if (subsRes.status === "fulfilled" && subsRes.value) {
          setSubmissions(Array.isArray(subsRes.value.items) ? subsRes.value.items : []);
        }

        if (!profLoaded && !histLoaded) {
          setHasError(true);
          const detail =
            (profRes.status === "rejected" && (profRes.reason?.response?.data?.detail || profRes.reason?.message)) ||
            (histRes.status === "rejected" && (histRes.reason?.response?.data?.detail || histRes.reason?.message)) ||
            "Failed to load student records.";
          setErrorMessage(detail);
        }
      })
      .catch((err) => {
        if (!isCurrent) return;
        setHasError(true);
        setErrorMessage(err?.message || "Failed to load student data");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [studentId]);

  if (!isModalOpen || !studentId) return null;

  // Safe fallbacks for all metrics
  const studentHistory = history;
  const isUnassigned = !profile?.group?.id && (!history?.group_name || history?.group_name === "Unassigned");
  const rawGroupName = profile?.group?.name || history?.group_name;
  const groupName = isUnassigned ? "No Cohort / Unassigned" : (rawGroupName || "No Cohort / Unassigned");
  const level = profile?.group?.english_level || history?.level || "";
  const totalStars = Number(profile?.total_stars ?? history?.total_stars ?? 0);
  const totalLightning = Number(history?.total_lightning ?? (profile as any)?.total_lightning ?? 0);

  const activeAssignments = isUnassigned ? [] : (Array.isArray(studentHistory?.active_assignments) ? studentHistory.active_assignments : []);
  const pastCycles = isUnassigned ? [] : (Array.isArray(studentHistory?.past_cycles) ? studentHistory.past_cycles : []);

  const historyItems = isUnassigned ? [] : (Array.isArray(studentHistory?.history) ? studentHistory.history : []);
  const lifetimeCompleted = historyItems.filter((h) => (Number(h?.completion_percentage) || 0) >= 100 || Boolean(h?.submission_id)).length;
  const lifetimeTotal = historyItems.length;

  const cycleCompleted = isUnassigned ? 0 : (studentHistory?.cycle_completed_tasks ?? 0);
  const cycleTotal = isUnassigned ? 0 : (studentHistory?.cycle_total_tasks ?? (activeAssignments.length > 0 ? activeAssignments.length : 0));
  const cyclePct = isUnassigned
    ? 0
    : (studentHistory?.cycle_progress_percentage ??
       (cycleTotal > 0 ? Math.round((cycleCompleted / cycleTotal) * 100) : 0));

  const fullName = profile?.full_name || history?.full_name || "Student Profile";
  const username = profile?.username || history?.username || "";
  const telegram = profile?.phone || history?.telegram_username || "";

  // Split history into active cycle tasks and past cycle tasks
  const { activeCycleItems, pastCycleItems } = useMemo(() => {
    if (Array.isArray(activeAssignments) && activeAssignments.length > 0) {
      return {
        activeCycleItems: activeAssignments,
        pastCycleItems: Array.isArray(pastCycles) ? pastCycles : [],
      };
    }
    if (!historyItems || historyItems.length === 0) {
      return { activeCycleItems: [], pastCycleItems: [] };
    }
    const active = historyItems.slice(0, cycleTotal > 0 ? cycleTotal : historyItems.length);
    const past = cycleTotal > 0 && cycleTotal < historyItems.length ? historyItems.slice(cycleTotal) : [];
    return { activeCycleItems: active, pastCycleItems: past };
  }, [activeAssignments, pastCycles, historyItems, cycleTotal]);

  function renderHistoryCard(h: any) {
    if (!h) return null;
    const subDetail = Array.isArray(submissions) ? submissions.find((s) => s && s.assignment_id === h.assignment_id) : undefined;
    const hasSubmission = Boolean(h.submission_id || h.submitted_at || subDetail);
    const isGraded = h.score !== null && h.score !== undefined;

    let isPastDeadline = false;
    if (h.deadline) {
      try {
        isPastDeadline = new Date(h.deadline).getTime() < Date.now();
      } catch {
        isPastDeadline = false;
      }
    }

    let deadlineStr = "No deadline";
    try {
      if (h.deadline) {
        const d = new Date(h.deadline);
        deadlineStr = isNaN(d.getTime()) ? String(h.deadline) : d.toLocaleString();
      }
    } catch {
      deadlineStr = String(h.deadline || "No deadline");
    }

    let submittedAtStr: string | null = null;
    try {
      if (h.submitted_at) {
        const d = new Date(h.submitted_at);
        submittedAtStr = isNaN(d.getTime()) ? String(h.submitted_at) : d.toLocaleString();
      }
    } catch {
      submittedAtStr = String(h.submitted_at);
    }

    return (
      <div
        key={h.assignment_id || h.id || Math.random()}
        className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5 shadow-xs"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h5 className="font-semibold text-zinc-900 dark:text-white text-sm">{h.title || "Untitled Assignment"}</h5>
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              <span>Deadline: {deadlineStr}</span>
              {submittedAtStr && (
                <span>Submitted: {submittedAtStr}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {h.vocab_score !== null && h.vocab_score !== undefined && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-mono">
                📖 New Words: {h.vocab_score}% {h.vocab_attempt_count && h.vocab_attempt_count > 1 ? `(Attempt ${h.vocab_attempt_count})` : ""}
              </span>
            )}
            {/* Anti-cheat duplicate flag badge */}
            {h.is_suspicious && (
              <button
                type="button"
                onClick={() => setInspectingDuplicateSubmissionId(h.submission_id || null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition active:scale-95 animate-pulse font-mono shadow-2xs cursor-pointer"
                title={h.flag_reason || "Click to inspect duplicate comparison"}
              >
                <span>🚨 {h.similarity_score ? `${Math.round(h.similarity_score * 100)}% Match` : "Flagged Copy"}</span>
              </button>
            )}
            {h.is_exempted ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono">
                🛡️ Exempted
              </span>
            ) : hasSubmission && isGraded ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                ✓ Graded ({h.score <= 10 ? h.score * 10 : h.score}%)
              </span>
            ) : hasSubmission && !isGraded ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                ✓ Submitted
              </span>
            ) : h.is_locked ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-mono"
                title={h.lock_reason || "Locked due to incomplete previous assignment"}
              >
                🔒 Locked
              </span>
            ) : isPastDeadline ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                ✕ Late
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                ⏳ Pending
              </span>
            )}

            {/* Quick-action button to manually lock / unlock task */}
            <button
              type="button"
              disabled={togglingAssignmentId === h.assignment_id}
              onClick={() => handleToggleLock(h.assignment_id, h.unlocked_by_teacher)}
              className={`p-1.5 rounded-lg border transition active:scale-95 text-xs flex items-center gap-1 shrink-0 ${
                h.unlocked_by_teacher || h.is_exempted
                  ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-750"
              }`}
              title={
                h.unlocked_by_teacher
                  ? "Manually unlocked by teacher (Click to lock)"
                  : h.is_exempted
                  ? "Exempted task (Click to lock)"
                  : "Click to manually unlock this task for student"
              }
            >
              {togglingAssignmentId === h.assignment_id ? (
                <Spinner className="w-3.5 h-3.5 text-zinc-500" />
              ) : h.unlocked_by_teacher || h.is_exempted ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline text-[10px] font-medium">Unlocked</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="hidden sm:inline text-[10px] font-medium">Unlock</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Score & Stars */}
        {h.score !== null && h.score !== undefined && (
          <div className="flex items-center gap-4 text-xs font-semibold bg-zinc-50 dark:bg-zinc-850 px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800">
            <span className="text-zinc-800 dark:text-zinc-200">
              Grade: <span className="text-blue-600 dark:text-blue-400 text-sm font-bold">{h.score}/10</span>
            </span>
            <span className="text-amber-600 dark:text-amber-400">⭐ +{h.stars_earned ?? 0} stars awarded</span>
            {h.submission_status && (
              <span className="text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider ml-auto">
                Status: {h.submission_status}
              </span>
            )}
          </div>
        )}

        {/* Student submitted text answer */}
        {(h.text_answer || subDetail?.text_answer) && (
          <div className="text-xs bg-zinc-50/60 dark:bg-zinc-850/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 font-semibold block mb-1">Student Answer:</span>
            <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
              {h.text_answer || subDetail?.text_answer}
            </p>
          </div>
        )}

        {/* Attached homework file download */}
        {subDetail?.file_url && (
          <div className="flex items-center gap-2 pt-1">
            <FileDownloadButton
              url={subDetail.file_url}
              filename={subDetail.file_original_name || `${h.title || "homework"}_file`}
              className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
            >
              <span>📎 Download Homework Attachment</span>
            </FileDownloadButton>
            <span className="text-zinc-400 dark:text-zinc-500 text-xs truncate max-w-[200px]">
              {subDetail.file_original_name}
            </span>
          </div>
        )}

        {/* Teacher Feedback */}
        {h.feedback && (
          <div className="text-xs bg-blue-50/50 dark:bg-blue-950/20 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/40 text-blue-900 dark:text-blue-300">
            <span className="font-semibold block mb-0.5">Teacher Feedback:</span>
            <p className="italic">"{h.feedback}"</p>
          </div>
        )}

        {/* Teacher Error Corrections */}
        {Array.isArray(subDetail?.corrections) && subDetail.corrections.length > 0 && (
          <div className="text-xs space-y-1.5 bg-rose-50/30 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900/40">
            <span className="font-bold text-rose-900 dark:text-rose-300 block">Teacher Error Corrections:</span>
            <div className="space-y-1.5">
              {subDetail.corrections.map((corr: any, idx: number) => {
                if (!corr) return null;
                return (
                  <div
                    key={corr.id || idx}
                    className="bg-white dark:bg-zinc-900 p-2 rounded border border-rose-200/60 dark:border-rose-900/60 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <del className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 py-0.5 rounded font-mono">
                        {corr.selected_text || ""}
                      </del>
                      <span className="text-zinc-400 dark:text-zinc-500">→</span>
                      <ins className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded font-semibold no-underline font-mono">
                        {corr.correction || ""}
                      </ins>
                      {corr.error_type && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {corr.error_type}
                        </span>
                      )}
                    </div>
                    {corr.comment && (
                      <span className="text-zinc-600 dark:text-zinc-400 text-[11px] italic">Note: {corr.comment}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Teacher Comments */}
        {Array.isArray(subDetail?.comments) && subDetail.comments.length > 0 && (
          <div className="text-xs space-y-1.5 bg-zinc-50/80 dark:bg-zinc-850/80 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 block">Comments:</span>
            {subDetail.comments.map((c: any, idx: number) => {
              if (!c) return null;
              let commentDate = "";
              try {
                if (c.created_at) {
                  const cd = new Date(c.created_at);
                  commentDate = isNaN(cd.getTime()) ? "" : cd.toLocaleString();
                }
              } catch {}
              return (
                <div key={c.id || idx} className="text-zinc-700 dark:text-zinc-300 text-xs bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                  <p>{c.comment}</p>
                  {commentDate && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 block">
                      {commentDate}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const vocabSets: StudentWordlistProgressItem[] = useMemo(() => {
    return Array.isArray(history?.vocabulary_sets) ? history.vocabulary_sets : [];
  }, [history]);

  const vocabTotalWords = history?.total_vocabulary_words ?? 0;
  const vocabMasteredWords = history?.mastered_vocabulary_words ?? 0;
  const vocabMasteredSets = history?.mastered_vocabulary_sets ?? 0;
  const vocabTotalSets = vocabSets.length;
  const vocabPct = vocabTotalWords > 0 ? Math.round((vocabMasteredWords / vocabTotalWords) * 100) : 0;

  function renderVocabCard(vs: StudentWordlistProgressItem) {
    if (!vs) return null;
    const isMastered = vs.is_mastered || (vs.best_score != null && vs.best_score >= 100);
    const hasAttempted = vs.attempts_count > 0;

    let lastAttemptStr: string | null = null;
    try {
      if (vs.last_attempt_at) {
        const d = new Date(vs.last_attempt_at);
        lastAttemptStr = isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      }
    } catch {}

    return (
      <div
        key={vs.set_id}
        className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5 shadow-xs"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h5 className="font-semibold text-zinc-900 dark:text-white text-sm truncate">{vs.title}</h5>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              <span>{vs.group_name || "Vocabulary Deck"}</span>
              <span>•</span>
              <span className="font-mono font-medium">{vs.total_words} words</span>
              {lastAttemptStr && (
                <>
                  <span>•</span>
                  <span>Last practiced: {lastAttemptStr}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {isMastered ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                ⭐ 100% Mastered
              </span>
            ) : hasAttempted ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 font-mono">
                ✓ Practiced ({vs.best_score ?? 0}%)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                ○ Not Attempted Yet
              </span>
            )}
          </div>
        </div>

        {hasAttempted && (
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold bg-zinc-50 dark:bg-zinc-850 px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800">
            {vs.best_score != null && (
              <span className="text-zinc-800 dark:text-zinc-200">
                Best Quiz Score: <span className="text-indigo-600 dark:text-indigo-400 font-bold font-mono">{vs.best_score}%</span>
              </span>
            )}
            {vs.best_time_seconds != null && vs.best_time_seconds > 0 && (
              <span className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                ⏱️ Best Time: {Math.floor(vs.best_time_seconds / 60)}m {vs.best_time_seconds % 60}s
              </span>
            )}
            <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px] ml-auto">
              Total Attempts: {vs.attempts_count}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal open={isModalOpen} onClose={onClose} title={`Student: ${fullName}`} maxWidth="sm:max-w-3xl">
      {isLoading && !profile && !history ? (
        <div className="space-y-4 py-8">
          <div className="flex flex-col items-center justify-center gap-3 text-zinc-500 dark:text-zinc-400">
            <Spinner className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium">Loading student history & submissions...</p>
          </div>
          <LoadingRows rows={5} />
        </div>
      ) : hasError && !profile && !history ? (
        <div className="p-6 text-center space-y-4">
          <div className="text-rose-500 text-3xl">⚠️</div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {errorMessage || "Failed to load student records."}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button type="button" className="btn-secondary text-xs px-4 py-2" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 pr-1 text-sm overflow-x-hidden w-full max-w-full">
          {/* Header Profile Info Card */}
          <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-slate-900/80 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <UserAvatar
                src={profile?.avatar_url}
                name={fullName}
                size="xl"
              />

              <div className="flex-1 min-w-0 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white truncate">{fullName}</h3>
                    {username && <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">@{username}</span>}
                    {profile && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          profile.is_active
                            ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                            : "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300"
                        }`}
                      >
                        {profile.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Quick Group Placement Selector */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Cohort:</span>
                      <select
                        disabled={isUpdatingGroup}
                        value={profile?.group?.id || ""}
                        onChange={(e) => handleQuickGroupChange(e.target.value)}
                        className="text-xs font-semibold py-1 px-2 max-w-[150px] sm:max-w-xs truncate rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-slate-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="">No Cohort (Unassigned)</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendParentReport}
                      disabled={isSendingParentDigest}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-700/60 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition shadow-xs shrink-0 whitespace-nowrap active:scale-95 cursor-pointer"
                      title="Send on-demand performance digest to parent via Telegram"
                    >
                      <span>📩</span>
                      <span>{isSendingParentDigest ? "Sending..." : "Parent Report"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewPassword("");
                        setConfirmPassword("");
                        setResetModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition shadow-xs shrink-0 whitespace-nowrap cursor-pointer"
                      title="Set temporary password for student"
                    >
                      <span>🔑</span>
                      <span>Reset Password</span>
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {profile?.email && (
                    <span>
                      Email: <strong className="text-zinc-800 dark:text-zinc-200 font-medium">{profile.email}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    Telegram: <TelegramLink username={telegram} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    📱 Parent:{" "}
                    {(history?.is_parent_linked || profile?.is_parent_linked) ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Linked ({history?.parent_name || profile?.parent_name || `@${history?.parent_telegram_username || profile?.parent_telegram_username}` || "Telegram"})
                      </span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-500 italic">Unlinked</span>
                    )}
                  </span>
                  <span>
                    Cohort: <strong className="text-zinc-900 dark:text-white font-medium">{groupName}</strong>
                  </span>
                  {level && (
                    <span>
                      Level: <strong className="capitalize text-zinc-900 dark:text-white font-medium">{level.replace("_", " ")}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {profile?.bio && (
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold text-zinc-500 dark:text-zinc-400 block mb-0.5">Bio:</span>
                <p className="italic bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">{profile.bio}</p>
              </div>
            )}
          </div>

          {/* Gamification & Progress Stats Row: Synchronized with Active Cohort Progress */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center">
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">⭐ Stars</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-300 mt-0.5 block">{totalStars}</span>
            </div>
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
              <span className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider block">⚡ Lightning</span>
              <span className="text-xl font-black text-yellow-600 dark:text-yellow-300 mt-0.5 block">{totalLightning}</span>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-center">
              <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider block">Active Cycle</span>
              <span className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-300 mt-0.5 block">
                {cycleCompleted} / {cycleTotal} ({cyclePct}%)
              </span>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-3 text-center">
              <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider block">📚 Vocabulary</span>
              <span className="text-sm sm:text-base font-black text-purple-600 dark:text-purple-300 mt-0.5 block">
                {vocabMasteredWords} / {vocabTotalWords || vocabMasteredWords} Words
              </span>
              <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80 block mt-0.5 font-medium">
                {vocabMasteredSets} / {vocabTotalSets} decks ({vocabPct}%)
              </span>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Lifetime Homework</span>
              <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-300 mt-0.5 block">
                {lifetimeCompleted} / {lifetimeTotal}
              </span>
            </div>
          </div>

          {/* Section Tabs: Active Cycle Assignments, Vocabulary Sets, Past Cycles */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab("assignments")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === "assignments"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <span>🎯 Active Tasks ({activeCycleItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("vocabulary")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === "vocabulary"
                  ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <span>📚 Vocabulary Sets ({vocabSets.length})</span>
            </button>
            {pastCycleItems.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("past")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTab === "past"
                    ? "bg-white dark:bg-slate-900 text-zinc-900 dark:text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <span>🕰️ Past Cycles ({pastCycleItems.length})</span>
              </button>
            )}
          </div>

          {/* Active Tab Content */}
          {activeTab === "assignments" && (
            <div className="space-y-3">
              {/* Action banner for new or transferred students */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/30 dark:via-zinc-900/40 border border-amber-300/60 dark:border-amber-800/60 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
                    <Zap className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white">
                      Transferred / New Student Catch-Up
                    </h5>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Exempt past assignments so the student starts directly from today's lesson without penalty.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUnlockingUpToDate}
                  onClick={handleUnlockUpToDate}
                  title="Exempt past assignments for new or transferred students"
                  className="btn-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs py-2 px-3.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 shrink-0 transition active:scale-95 disabled:opacity-50"
                >
                  {isUnlockingUpToDate ? (
                    <>
                      <Spinner className="w-3.5 h-3.5 text-white" />
                      <span>Unlocking...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ Unlock All Up-to-Date</span>
                    </>
                  )}
                </button>
              </div>

              {activeCycleItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No assignments published in the active cycle yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCycleItems.map(renderHistoryCard)}
                </div>
              )}
            </div>
          )}

          {activeTab === "vocabulary" && (
            <div className="space-y-3">
              {vocabSets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No vocabulary decks assigned or attempted yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {vocabSets.map(renderVocabCard)}
                </div>
              )}
            </div>
          )}

          {activeTab === "past" && (
            <div className="space-y-3">
              {pastCycleItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No past cycle archives for this student yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {pastCycleItems.map(renderHistoryCard)}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Embedded Reset Password Dialog */}
      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={`Reset Password: ${fullName}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-sm">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Enter a temporary password for <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{fullName}</strong> (@{username}).
            Their active sessions will be invalidated and they can login with this password immediately.
          </p>
          <div>
            <label className="label">New Temporary Password *</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              placeholder="Minimum 6 characters"
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
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResetModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isResetting}
              className="btn-primary"
            >
              {isResetting ? "Resetting..." : "Set Password"}
            </button>
          </div>
        </form>
      </Modal>

      <DuplicateCompareModal
        isOpen={Boolean(inspectingDuplicateSubmissionId)}
        submissionId={inspectingDuplicateSubmissionId}
        onClose={() => setInspectingDuplicateSubmissionId(null)}
        onFlagDismissed={() => {
          if (studentId) getStudentHistory(studentId).then(setHistory).catch(() => {});
          if (onStudentUpdated) onStudentUpdated();
        }}
        onMarkedCheated={() => {
          if (studentId) getStudentHistory(studentId).then(setHistory).catch(() => {});
          if (onStudentUpdated) onStudentUpdated();
        }}
      />
    </Modal>
  );
}

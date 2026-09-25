import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { ChevronDown, History } from "lucide-react";
import { FileDownloadButton, LoadingRows, Modal, Spinner, TelegramLink } from "@/components/ui";
import { getStudent, getStudentHistory, listGroups, listSubmissions, resetStudentPassword, updateStudentPlacement } from "@/services/lmsService";
import { Group, StudentHistoryOut, StudentOut, SubmissionOut } from "@/types";
import { UserAvatar } from "@/components/common/UserAvatar";

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

  const isModalOpen = (isOpen ?? open) !== undefined ? Boolean(isOpen ?? open) : Boolean(studentId);

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

          {/* Task Item Badges according to Master Spec */}
          {hasSubmission && isGraded ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              ✓ Graded ({h.score <= 10 ? h.score * 10 : h.score}%)
            </span>
          ) : hasSubmission && !isGraded ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
              ✓ Submitted (Pending Review)
            </span>
          ) : isPastDeadline ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
              ✕ Overdue
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              ○ Not Submitted
            </span>
          )}
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

  return (
    <Modal open={isModalOpen} onClose={onClose} title={`Student: ${fullName}`}>
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
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1 text-sm">
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
                      onClick={() => {
                        setNewPassword("");
                        setConfirmPassword("");
                        setResetModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition shadow-xs shrink-0 whitespace-nowrap"
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">⭐ Stars</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-300 mt-0.5 block">{totalStars}</span>
            </div>
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
              <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider block">⚡ Lightning</span>
              <span className="text-xl font-black text-yellow-600 dark:text-yellow-300 mt-0.5 block">{totalLightning}</span>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-center">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider block">Active Cycle Progress</span>
              <span className="text-xl font-black text-blue-600 dark:text-blue-300 mt-0.5 block">
                {cycleCompleted} / {cycleTotal} Tasks ({cyclePct}%)
              </span>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Lifetime Completed</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-300 mt-0.5 block">
                {lifetimeCompleted} / {lifetimeTotal}
              </span>
            </div>
          </div>

          {/* Primary Section: Active Cycle Assignments */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h4 className="font-bold text-zinc-900 dark:text-white text-sm flex items-center gap-1.5">
                <span>🎯 Active Cycle Assignments</span>
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">({activeCycleItems.length} tasks)</span>
              </h4>
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

          {/* Secondary Section: Past Cycles History (Collapsible Accordion) */}
          {pastCycleItems.length > 0 && (
            <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setIsPastCyclesOpen(!isPastCyclesOpen)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-100/70 hover:bg-zinc-100 dark:bg-slate-900/50 dark:hover:bg-slate-900/80 border border-zinc-200/60 dark:border-zinc-800/70 text-zinc-700 dark:text-zinc-300 font-medium transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-zinc-500" />
                  <span className="font-semibold text-xs text-zinc-900 dark:text-white">
                    Past Cycles History ({pastCycleItems.length} archived assignments)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-500 font-medium">
                  <span>{isPastCyclesOpen ? "Collapse" : "Expand"}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isPastCyclesOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {isPastCyclesOpen && (
                <div className="space-y-3 mt-3 pt-1">
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
    </Modal>
  );
}

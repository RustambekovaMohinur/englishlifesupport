import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FileDownloadButton, LoadingRows, Modal, TelegramLink } from "@/components/ui";
import { getStudent, getStudentHistory, listSubmissions, resetStudentPassword } from "@/services/lmsService";
import { StudentHistoryOut, StudentOut, SubmissionOut } from "@/types";

interface StudentDetailModalProps {
  studentId: string | null;
  onClose: () => void;
}

export default function StudentDetailModal({ studentId, onClose }: StudentDetailModalProps) {
  const [profile, setProfile] = useState<StudentOut | null>(null);
  const [history, setHistory] = useState<StudentHistoryOut | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

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

  useEffect(() => {
    if (!studentId) {
      setProfile(null);
      setHistory(null);
      setSubmissions([]);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);

    Promise.allSettled([
      getStudent(studentId),
      getStudentHistory(studentId),
      listSubmissions({ student_id: studentId, page_size: 50 }),
    ])
      .then(([profRes, histRes, subsRes]) => {
        if (!isCurrent) return;

        if (profRes.status === "fulfilled") {
          setProfile(profRes.value);
        } else {
          toast.error("Failed to load student profile");
        }

        if (histRes.status === "fulfilled") {
          setHistory(histRes.value);
        }

        if (subsRes.status === "fulfilled") {
          setSubmissions(subsRes.value.items);
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [studentId]);

  if (!studentId) return null;

  const fullName = profile?.full_name || history?.full_name || "Student Details";
  const username = profile?.username || history?.username || "";
  const telegram = profile?.phone || history?.telegram_username || "";
  const groupName = profile?.group?.name || history?.group_name || "Unassigned";
  const level = profile?.group?.english_level || history?.level || "";
  const totalStars = profile?.total_stars ?? history?.total_stars ?? 0;
  const totalLightning = history?.total_lightning ?? 0;

  const totalTasks = history?.history?.length ?? 0;
  const completedTasks = history?.history?.filter((h) => h.completion_percentage >= 100).length ?? 0;
  const overallPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <Modal open={!!studentId} onClose={onClose} title={`Student: ${fullName}`}>
      {isLoading && !profile && !history ? (
        <LoadingRows rows={5} />
      ) : (
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1 text-sm">
          {/* Header Profile Info Card */}
          <div className="rounded-xl border border-[#EAE9E5] dark:border-[#30363D] bg-zinc-50/80 dark:bg-zinc-900/80 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/60 font-bold text-brand-700 dark:text-brand-400 text-xl overflow-hidden border border-brand-200 dark:border-brand-800">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={fullName} className="h-full w-full object-cover" />
                ) : (
                  fullName.slice(0, 2).toUpperCase()
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <button
                    type="button"
                    onClick={() => {
                      setNewPassword("");
                      setConfirmPassword("");
                      setResetModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition shadow-xs"
                    title="Set temporary password for student"
                  >
                    <span>🔑</span>
                    <span>Reset Password</span>
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {profile?.email && (
                    <span>
                      Email: <strong className="text-zinc-800 dark:text-zinc-200 font-medium">{profile.email}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    Telegram: <TelegramLink username={telegram} />
                  </span>
                  <span>
                    Group: <strong className="text-zinc-900 dark:text-white font-medium">{groupName}</strong>
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
                <p className="italic bg-white dark:bg-[#161B22] p-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">{profile.bio}</p>
              </div>
            )}
          </div>

          {/* Gamification & Progress Stats Row */}
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
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider block">Tasks Completed</span>
              <span className="text-xl font-black text-blue-600 dark:text-blue-300 mt-0.5 block">
                {completedTasks} / {totalTasks}
              </span>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Overall Progress</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-300 mt-0.5 block">{overallPct}%</span>
            </div>
          </div>

          {/* Detailed Assignment & Submissions History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h4 className="font-bold text-zinc-900 dark:text-white text-sm flex items-center gap-1.5">
                <span>📝 Assignment & Homework History</span>
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">({totalTasks} assignments)</span>
              </h4>
            </div>

            {!history || history.history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No assignments assigned to this student's group yet.
              </div>
            ) : (
              <div className="space-y-3">
                {history.history.map((h) => {
                  const subDetail = submissions.find((s) => s.assignment_id === h.assignment_id);
                  const isDone = h.completion_percentage >= 100;
                  const isZero = h.completion_percentage === 0;

                  return (
                    <div
                      key={h.assignment_id}
                      className="rounded-xl border border-[#EAE9E5] dark:border-[#30363D] bg-white dark:bg-[#161B22] p-3.5 space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h5 className="font-semibold text-zinc-900 dark:text-white text-sm">{h.title}</h5>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            <span>Deadline: {new Date(h.deadline).toLocaleString()}</span>
                            {h.submitted_at && (
                              <span>Submitted: {new Date(h.submitted_at).toLocaleString()}</span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                            isDone
                              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                              : isZero
                              ? "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300"
                              : "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                          }`}
                        >
                          {isDone ? "✓ Complete (100%)" : isZero ? "✕ Not completed (0%)" : `⏳ ${h.completion_percentage}%`}
                        </span>
                      </div>

                      {/* Score & Stars */}
                      {h.score !== null && (
                        <div className="flex items-center gap-4 text-xs font-semibold bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800">
                          <span className="text-zinc-800 dark:text-zinc-200">
                            Grade: <span className="text-brand-600 dark:text-brand-400 text-sm font-bold">{h.score}/10</span>
                          </span>
                          <span className="text-amber-600 dark:text-amber-400">⭐ +{h.stars_earned} stars awarded</span>
                          {h.submission_status && (
                            <span className="text-zinc-500 dark:text-zinc-400 uppercase text-[10px] tracking-wider ml-auto">
                              Status: {h.submission_status}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Student submitted text answer */}
                      {(h.text_answer || subDetail?.text_answer) && (
                        <div className="text-xs bg-zinc-50/60 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
                            filename={subDetail.file_original_name || `${h.title}_homework`}
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
                        <div className="text-xs bg-brand-50/50 dark:bg-brand-950/20 p-2.5 rounded-lg border border-brand-100 dark:border-brand-900/40 text-brand-900 dark:text-brand-300">
                          <span className="font-semibold block mb-0.5">Teacher Feedback:</span>
                          <p className="italic">"{h.feedback}"</p>
                        </div>
                      )}

                      {/* Teacher Error Corrections */}
                      {subDetail?.corrections && subDetail.corrections.length > 0 && (
                        <div className="text-xs space-y-1.5 bg-rose-50/30 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900/40">
                          <span className="font-bold text-rose-900 dark:text-rose-300 block">Teacher Error Corrections:</span>
                          <div className="space-y-1.5">
                            {subDetail.corrections.map((corr) => (
                              <div
                                key={corr.id}
                                className="bg-white dark:bg-zinc-900 p-2 rounded border border-rose-200/60 dark:border-rose-900/60 text-xs flex flex-col gap-1"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <del className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 py-0.5 rounded font-mono">
                                    {corr.selected_text}
                                  </del>
                                  <span className="text-zinc-400 dark:text-zinc-500">→</span>
                                  <ins className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded font-semibold no-underline font-mono">
                                    {corr.correction}
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
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Teacher Comments */}
                      {subDetail?.comments && subDetail.comments.length > 0 && (
                        <div className="text-xs space-y-1.5 bg-zinc-50/80 dark:bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200 block">Comments:</span>
                          {subDetail.comments.map((c) => (
                            <div key={c.id} className="text-zinc-700 dark:text-zinc-300 text-xs bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                              <p>{c.comment}</p>
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 block">
                                {new Date(c.created_at).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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

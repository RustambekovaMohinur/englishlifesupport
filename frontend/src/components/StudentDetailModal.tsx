import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FileDownloadButton, LoadingRows, Modal } from "@/components/ui";
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
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-xl overflow-hidden border border-brand-200">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={fullName} className="h-full w-full object-cover" />
                ) : (
                  fullName.slice(0, 2).toUpperCase()
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-neutral-900 truncate">{fullName}</h3>
                    {username && <span className="text-xs text-neutral-500 font-mono">@{username}</span>}
                    {profile && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          profile.is_active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition shadow-xs"
                    title="Set temporary password for student"
                  >
                    <span>🔑</span>
                    <span>Reset Password</span>
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
                  {profile?.email && (
                    <span>
                      Email: <strong className="text-neutral-800 font-medium">{profile.email}</strong>
                    </span>
                  )}
                  <span>
                    Telegram:{" "}
                    {telegram ? (
                      <span className="font-medium text-brand-600">
                        {telegram.startsWith("@") ? telegram : `@${telegram}`}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </span>
                  <span>
                    Group: <strong className="text-neutral-900">{groupName}</strong>
                  </span>
                  {level && (
                    <span>
                      Level: <strong className="capitalize text-neutral-900">{level.replace("_", " ")}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {profile?.bio && (
              <div className="mt-3 pt-3 border-t border-neutral-200 text-xs text-neutral-700">
                <span className="font-semibold text-neutral-500 block mb-0.5">Bio:</span>
                <p className="italic bg-white p-2.5 rounded-lg border border-neutral-200/80">{profile.bio}</p>
              </div>
            )}
          </div>

          {/* Gamification & Progress Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">⭐ Stars</span>
              <span className="text-xl font-black text-amber-600 mt-0.5 block">{totalStars}</span>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50/50 p-3 text-center">
              <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wider block">⚡ Lightning</span>
              <span className="text-xl font-black text-yellow-600 mt-0.5 block">{totalLightning}</span>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-center">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block">Tasks Completed</span>
              <span className="text-xl font-black text-blue-600 mt-0.5 block">
                {completedTasks} / {totalTasks}
              </span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">Overall Progress</span>
              <span className="text-xl font-black text-emerald-600 mt-0.5 block">{overallPct}%</span>
            </div>
          </div>

          {/* Detailed Assignment & Submissions History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <h4 className="font-bold text-neutral-900 text-sm flex items-center gap-1.5">
                <span>📝 Assignment & Homework History</span>
                <span className="text-xs font-normal text-neutral-500">({totalTasks} assignments)</span>
              </h4>
            </div>

            {!history || history.history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-500">
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
                      className="rounded-xl border border-neutral-200 bg-white p-3.5 space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h5 className="font-semibold text-neutral-900 text-sm">{h.title}</h5>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 mt-0.5">
                            <span>Deadline: {new Date(h.deadline).toLocaleString()}</span>
                            {h.submitted_at && (
                              <span>Submitted: {new Date(h.submitted_at).toLocaleString()}</span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                            isDone
                              ? "bg-emerald-100 text-emerald-800"
                              : isZero
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isDone ? "✓ Complete (100%)" : isZero ? "✕ Not completed (0%)" : `⏳ ${h.completion_percentage}%`}
                        </span>
                      </div>

                      {/* Score & Stars */}
                      {h.score !== null && (
                        <div className="flex items-center gap-4 text-xs font-semibold bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-100">
                          <span className="text-neutral-800">
                            Grade: <span className="text-brand-600 text-sm">{h.score}/10</span>
                          </span>
                          <span className="text-amber-600">⭐ +{h.stars_earned} stars awarded</span>
                          {h.submission_status && (
                            <span className="text-neutral-500 uppercase text-[10px] tracking-wider ml-auto">
                              Status: {h.submission_status}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Student submitted text answer */}
                      {(h.text_answer || subDetail?.text_answer) && (
                        <div className="text-xs bg-neutral-50/60 p-2.5 rounded-lg border border-neutral-200">
                          <span className="text-neutral-500 font-semibold block mb-1">Student Answer:</span>
                          <p className="text-neutral-800 whitespace-pre-wrap">
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
                          <span className="text-neutral-400 text-xs truncate max-w-[200px]">
                            {subDetail.file_original_name}
                          </span>
                        </div>
                      )}

                      {/* Teacher Feedback */}
                      {h.feedback && (
                        <div className="text-xs bg-brand-50/50 p-2.5 rounded-lg border border-brand-100 text-brand-900">
                          <span className="font-semibold block mb-0.5">Teacher Feedback:</span>
                          <p className="italic">"{h.feedback}"</p>
                        </div>
                      )}

                      {/* Teacher Error Corrections */}
                      {subDetail?.corrections && subDetail.corrections.length > 0 && (
                        <div className="text-xs space-y-1.5 bg-rose-50/30 p-2.5 rounded-lg border border-rose-100">
                          <span className="font-bold text-rose-900 block">Teacher Error Corrections:</span>
                          <div className="space-y-1.5">
                            {subDetail.corrections.map((corr) => (
                              <div
                                key={corr.id}
                                className="bg-white p-2 rounded border border-rose-200/60 text-xs flex flex-col gap-1"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <del className="text-rose-600 bg-rose-50 px-1 py-0.5 rounded font-mono">
                                    {corr.selected_text}
                                  </del>
                                  <span className="text-neutral-400">→</span>
                                  <ins className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold no-underline font-mono">
                                    {corr.correction}
                                  </ins>
                                  {corr.error_type && (
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                                      {corr.error_type}
                                    </span>
                                  )}
                                </div>
                                {corr.comment && (
                                  <span className="text-neutral-600 text-[11px] italic">Note: {corr.comment}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Teacher Comments */}
                      {subDetail?.comments && subDetail.comments.length > 0 && (
                        <div className="text-xs space-y-1.5 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
                          <span className="font-bold text-neutral-800 block">Comments:</span>
                          {subDetail.comments.map((c) => (
                            <div key={c.id} className="text-neutral-700 text-xs bg-white p-2 rounded border border-neutral-200">
                              <p>{c.comment}</p>
                              <span className="text-[10px] text-neutral-400 mt-0.5 block">
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

          <div className="flex justify-end pt-2 border-t border-neutral-200">
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
          <p className="text-xs text-neutral-500">
            Enter a temporary password for <strong className="text-neutral-800">{fullName}</strong> (@{username}).
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
          <div className="flex justify-end gap-2 pt-3 border-t">
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

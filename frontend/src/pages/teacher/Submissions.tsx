import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  EmptyState,
  LoadingRows,
  Modal,
  StatusBadge,
  FileDownloadButton,
  AuthenticatedAudio,
  AuthenticatedImage,
  ImageLightbox,
} from "@/components/ui";
import {
  addSubmissionComment,
  addSubmissionCorrection,
  deleteSubmissionComment,
  deleteSubmissionCorrection,
  getSubmission,
  gradeSubmission,
  listGroups,
  listSubmissions,
} from "@/services/lmsService";
import { Group, SubmissionCommentOut, SubmissionCorrectionOut, SubmissionOut } from "@/types";

const PAGE_SIZE = 15;

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [grading, setGrading] = useState<SubmissionOut | null>(null);

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {});
  }, []);

  function refresh() {
    setIsLoading(true);
    listSubmissions({
      group_id: groupFilter || undefined,
      status: statusFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setSubmissions(res.items);
        setTotal(res.total);
      })
      .catch(() => toast.error("Failed to load submissions"))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [groupFilter, statusFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Submissions</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Review and grade student homework</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="input max-w-[200px]"
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
        <select
          className="input max-w-[180px]"
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="late">Late</option>
          <option value="graded">Graded</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <LoadingRows rows={8} />
        ) : submissions.length === 0 ? (
          <EmptyState title="No submissions found" description="Try a different filter." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/80 dark:border-zinc-800 text-left bg-zinc-50/50 dark:bg-zinc-900/50">
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Student</th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Assignment</th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Submitted</th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Status</th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {submissions.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition">
                    <td className="py-3.5 px-4 font-medium text-zinc-900 dark:text-white">{s.student_name}</td>
                    <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400">{s.assignment_title}</td>
                    <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400 font-mono text-xs">{format(new Date(s.submitted_at), "MMM d, HH:mm")}</td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3.5 px-4">
                      <button className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setGrading(s)}>
                        {s.grade ? "View / Edit grade" : "Grade"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="space-x-2">
                <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <GradeModal
        submission={grading}
        onClose={() => setGrading(null)}
        onGraded={(updatedGrade) => {
          setSubmissions((prev) =>
            prev.map((s) => (s.id === grading?.id ? { ...s, status: "graded", grade: updatedGrade } : s))
          );
          setGrading(null);
        }}
      />
    </div>
  );
}

function GradeModal({
  submission,
  onClose,
  onGraded,
}: {
  submission: SubmissionOut | null;
  onClose: () => void;
  onGraded: (grade: SubmissionOut["grade"]) => void;
}) {
  const [score, setScore] = useState(8);
  const [stars, setStars] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Corrections state
  const [corrections, setCorrections] = useState<SubmissionCorrectionOut[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [errorType, setErrorType] = useState("grammar");
  const [correctionComment, setCorrectionComment] = useState("");
  const [isAddingCorrection, setIsAddingCorrection] = useState(false);

  // Comments state
  const [comments, setComments] = useState<SubmissionCommentOut[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);

  useEffect(() => {
    if (submission) {
      setScore(submission.grade?.score ?? 8);
      setStars(submission.grade?.stars ?? 5);
      setFeedback(submission.grade?.feedback ?? "");
      setCorrections(submission.corrections || []);
      setComments(submission.comments || []);
      setSelectedText("");
      setCorrectionText("");
      setCorrectionComment("");

      // Fetch fresh details to ensure latest corrections/comments
      getSubmission(submission.id)
        .then((fresh) => {
          if (fresh.corrections) setCorrections(fresh.corrections);
          if (fresh.comments) setComments(fresh.comments);
        })
        .catch(() => {});
    }
  }, [submission]);

  if (!submission) return null;

  async function handleSave() {
    setIsSaving(true);
    try {
      const grade = await gradeSubmission(submission!.id, { score, stars, feedback: feedback || undefined });
      toast.success("Grade saved");
      onGraded(grade);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save grade");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCaptureSelection() {
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      setSelectedText(sel);
      toast.success(`Selected text: "${sel}"`);
    } else {
      toast("Highlight some text in the answer first, then click here.");
    }
  }

  async function handleAddCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedText.trim() || !correctionText.trim()) {
      toast.error("Please provide both selected text and correction");
      return;
    }
    setIsAddingCorrection(true);
    try {
      const created = await addSubmissionCorrection(submission!.id, {
        selected_text: selectedText.trim(),
        correction: correctionText.trim(),
        error_type: errorType || undefined,
        comment: correctionComment.trim() || undefined,
      });
      setCorrections((prev) => [...prev, created]);
      setSelectedText("");
      setCorrectionText("");
      setCorrectionComment("");
      toast.success("Correction added");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to add correction");
    } finally {
      setIsAddingCorrection(false);
    }
  }

  async function handleDeleteCorrection(corrId: string) {
    try {
      await deleteSubmissionCorrection(submission!.id, corrId);
      setCorrections((prev) => prev.filter((c) => c.id !== corrId));
      toast.success("Correction removed");
    } catch {
      toast.error("Failed to delete correction");
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setIsAddingComment(true);
    try {
      const comm = await addSubmissionComment(submission!.id, { comment: newComment.trim() });
      setComments((prev) => [...prev, comm]);
      setNewComment("");
      toast.success("Comment posted");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to add comment");
    } finally {
      setIsAddingComment(false);
    }
  }

  async function handleDeleteComment(commId: string) {
    try {
      await deleteSubmissionComment(submission!.id, commId);
      setComments((prev) => prev.filter((c) => c.id !== commId));
      toast.success("Comment removed");
    } catch {
      toast.error("Failed to delete comment");
    }
  }

  return (
    <Modal open={!!submission} onClose={onClose} title={`Homework Review: ${submission.student_name}`}>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
        {/* Assignment info */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">Assignment</p>
            <p className="text-base font-medium text-zinc-900 dark:text-white">{submission.assignment_title}</p>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        {/* Text answer & Interactive correction */}
        {submission.text_answer && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Student Text Answer
              </label>
              <button
                type="button"
                onClick={handleCaptureSelection}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 px-2.5 py-1 rounded transition"
              >
                ✏️ Correct Highlighted Text
              </button>
            </div>
            <div
              className="whitespace-pre-wrap rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-800 dark:text-zinc-200 selection:bg-brand-200 selection:text-brand-900 dark:selection:bg-brand-900 dark:selection:text-brand-100 leading-relaxed"
            >
              {submission.text_answer}
            </div>

            {/* Error Marking Section */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400 tracking-wider">
                Mark Error in Submission
              </p>
              <form onSubmit={handleAddCorrection} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 block">Mistake / Selected Text</label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="e.g. I goes"
                      value={selectedText}
                      onChange={(e) => setSelectedText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 block">Correction</label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="e.g. I went"
                      value={correctionText}
                      onChange={(e) => setCorrectionText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 block">Error Type</label>
                    <select
                      className="input text-xs"
                      value={errorType}
                      onChange={(e) => setErrorType(e.target.value)}
                    >
                      <option value="grammar">Grammar</option>
                      <option value="spelling">Spelling</option>
                      <option value="vocabulary">Vocabulary</option>
                      <option value="punctuation">Punctuation</option>
                      <option value="word_order">Word Order</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    className="input text-xs flex-1"
                    placeholder="Explanation / rule (e.g. Use past simple for completed events)"
                    value={correctionComment}
                    onChange={(e) => setCorrectionComment(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isAddingCorrection || !selectedText.trim() || !correctionText.trim()}
                    className="btn-primary text-xs whitespace-nowrap px-4 py-2"
                  >
                    {isAddingCorrection ? "Adding..." : "+ Add Correction"}
                  </button>
                </div>
              </form>

              {/* Existing corrections list */}
              {corrections.length > 0 && (
                <div className="pt-2 border-t border-amber-500/20 space-y-2">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Annotated Corrections ({corrections.length}):</p>
                  <div className="space-y-1.5">
                    {corrections.map((corr) => (
                      <div
                        key={corr.id}
                        className="flex items-center justify-between bg-white dark:bg-[#161B22] border border-zinc-200 dark:border-zinc-800 rounded p-2 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-medium capitalize">
                            {corr.error_type || "Error"}
                          </span>
                          <span className="line-through text-red-600 dark:text-red-400 font-medium">"{corr.selected_text}"</span>
                          <span className="text-zinc-400 dark:text-zinc-500">➔</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
                            "{corr.correction}"
                          </span>
                          {corr.comment && <span className="text-zinc-500 dark:text-zinc-400 italic">({corr.comment})</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCorrection(corr.id)}
                          className="text-zinc-400 hover:text-red-500 ml-2"
                          title="Delete correction"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attached images from student */}
        {submission.images && submission.images.length > 0 && (
          <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                📸 Submitted Images / Notebook Scans ({submission.images.length})
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Click to enlarge</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {submission.images.map((img, idx) => (
                <div
                  key={img.id}
                  onClick={() => {
                    setLightboxIndex(idx);
                    setLightboxOpen(true);
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 aspect-square hover:shadow-md transition-shadow"
                >
                  <AuthenticatedImage
                    url={`/api/submissions/${submission.id}/images/${img.id}`}
                    alt={img.original_name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[11px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
                      🔍 View
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attached file & audio */}
        {submission.file_url && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Attached File / Voice Recording</p>
            <FileDownloadButton
              url={submission.file_url}
              filename={submission.file_original_name}
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline inline-block mb-1"
            >
              📎 {submission.file_original_name ?? "Download attached file"}
            </FileDownloadButton>
            {submission.file_original_name && /\.(mp3|wav|ogg|webm|m4a)$/i.test(submission.file_original_name) && (
              <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="text-xs font-semibold text-purple-900 dark:text-purple-300 mb-1">🎙️ Student Voice Audio Recording</p>
                <AuthenticatedAudio url={submission.file_url} className="w-full h-9" />
              </div>
            )}
          </div>
        )}

        {/* General Comments */}
        <div className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/50">
          <p className="text-xs font-semibold uppercase text-zinc-700 dark:text-zinc-300 tracking-wider">
            Teacher Submission Comments
          </p>
          {comments.length > 0 && (
            <div className="space-y-2">
              {comments.map((comm) => (
                <div
                  key={comm.id}
                  className="flex items-start justify-between bg-white dark:bg-[#161B22] border border-zinc-200 dark:border-zinc-800 rounded p-2.5 text-xs text-zinc-800 dark:text-zinc-200"
                >
                  <div>
                    <p className="whitespace-pre-wrap">{comm.comment}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                      {format(new Date(comm.created_at), "MMM d, HH:mm")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comm.id)}
                    className="text-zinc-400 hover:text-red-500 text-xs ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              className="input text-xs flex-1"
              placeholder="Add feedback comment for the student..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button
              type="submit"
              disabled={isAddingComment || !newComment.trim()}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {isAddingComment ? "Posting..." : "Comment"}
            </button>
          </form>
        </div>

        {/* Grading score, custom stars & feedback */}
        <div className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/50">
          <p className="text-xs font-semibold uppercase text-zinc-700 dark:text-zinc-300 tracking-wider">
            Pedagogical Grading Studio & Stars
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Score (0–10)</label>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">{score}/10</span>
              </div>
              <input
                type="number"
                min={0}
                max={10}
                className="input font-mono font-bold"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              />
              {/* One-click Score Pills */}
              <div className="flex flex-wrap gap-1 mt-2">
                {[
                  { val: 10, label: "10 ★ Max" },
                  { val: 9, label: "9 ★ Great" },
                  { val: 8, label: "8 ★ Good" },
                  { val: 7, label: "7 ★ Fair" },
                  { val: 6, label: "6 ★ Pass" },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setScore(p.val)}
                    className={`text-[11px] px-2 py-0.5 rounded-md border transition ${
                      score === p.val
                        ? "bg-emerald-600 text-white border-emerald-700 font-bold shadow-xs"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Stars Awarded (0–100 ⭐)</label>
                <span className="text-xs font-bold text-amber-500 font-mono">+{stars} ⭐</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() => setStars((s) => Math.max(0, s - 1))}
                    className="h-9 w-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-center transition"
                    title="Decrease 1 star"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input text-center font-semibold font-mono"
                    value={stars}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, parseInt(e.target.value || "0", 10)));
                      setStars(val);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setStars((s) => Math.min(100, s + 1))}
                    className="h-9 w-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-center transition"
                    title="Increase 1 star"
                  >
                    +
                  </button>
                </div>
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1">
                  {[5, 10, 15, 20, 25].map((starPreset) => (
                    <button
                      key={starPreset}
                      type="button"
                      onClick={() => setStars(starPreset)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition ${
                        stars === starPreset
                          ? "bg-amber-500 text-white border-amber-600 font-bold shadow-xs"
                          : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      }`}
                    >
                      +{starPreset}★
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Teacher Pedagogical Feedback
              </label>
              <span className="text-[10px] text-zinc-400">Click a template below to auto-fill</span>
            </div>

            {/* Quick Feedback Presets */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                "🌟 Excellent fluency, natural intonation, and confident delivery!",
                "👍 Great effort! Be sure to pay attention to past tense verb endings.",
                "🎯 Accurate vocabulary usage. Focus on sentence flow and pacing.",
                "💡 Well-structured ideas! Expand further on supporting examples.",
              ].map((template, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFeedback((prev) => prev ? `${prev} ${template}` : template)}
                  className="text-[11px] text-left px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-brand-50 dark:hover:bg-brand-950/40 text-zinc-700 dark:text-zinc-300 hover:text-brand-700 dark:hover:text-brand-300 border border-zinc-200 dark:border-zinc-700 transition"
                >
                  {template}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              className="input text-sm resize-none"
              placeholder="Constructive feedback, encouragement, and areas for improvement..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        </div>


        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save Grade & Feedback"}
          </button>
        </div>
      </div>

      <ImageLightbox
        isOpen={lightboxOpen}
        images={(submission.images || []).map((img) => ({
          url: `/api/submissions/${submission.id}/images/${img.id}`,
          name: img.original_name,
        }))}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </Modal>
  );
}

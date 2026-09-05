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
        <h1 className="text-2xl font-bold text-neutral-900">Submissions</h1>
        <p className="text-sm text-neutral-500">Review and grade student homework</p>
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
                <tr className="border-b border-neutral-100 text-left text-neutral-500">
                  <th className="pb-2 pr-4 font-medium">Student</th>
                  <th className="pb-2 pr-4 font-medium">Assignment</th>
                  <th className="pb-2 pr-4 font-medium">Submitted</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-neutral-800">{s.student_name}</td>
                    <td className="py-3 pr-4 text-neutral-600">{s.assignment_title}</td>
                    <td className="py-3 pr-4 text-neutral-500">{format(new Date(s.submitted_at), "MMM d, HH:mm")}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3">
                      <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setGrading(s)}>
                        {s.grade ? "View / Edit grade" : "Grade"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
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
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Assignment</p>
            <p className="text-base font-medium text-neutral-900">{submission.assignment_title}</p>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        {/* Text answer & Interactive correction */}
        {submission.text_answer && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-neutral-800">
                Student Text Answer
              </label>
              <button
                type="button"
                onClick={handleCaptureSelection}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded transition"
              >
                ✏️ Correct Highlighted Text
              </button>
            </div>
            <div
              className="whitespace-pre-wrap rounded-lg bg-neutral-50 border border-neutral-200 p-4 text-sm text-neutral-800 selection:bg-brand-200 selection:text-brand-900 leading-relaxed"
            >
              {submission.text_answer}
            </div>

            {/* Error Marking Section */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase text-amber-800 tracking-wider">
                Mark Error in Submission
              </p>
              <form onSubmit={handleAddCorrection} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-neutral-600 mb-1 block">Mistake / Selected Text</label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="e.g. I goes"
                      value={selectedText}
                      onChange={(e) => setSelectedText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 mb-1 block">Correction</label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="e.g. I went"
                      value={correctionText}
                      onChange={(e) => setCorrectionText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 mb-1 block">Error Type</label>
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
                <div className="pt-2 border-t border-amber-200/70 space-y-2">
                  <p className="text-xs font-semibold text-neutral-700">Annotated Corrections ({corrections.length}):</p>
                  <div className="space-y-1.5">
                    {corrections.map((corr) => (
                      <div
                        key={corr.id}
                        className="flex items-center justify-between bg-white border border-neutral-200 rounded p-2 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium capitalize">
                            {corr.error_type || "Error"}
                          </span>
                          <span className="line-through text-red-600 font-medium">"{corr.selected_text}"</span>
                          <span className="text-neutral-400">➔</span>
                          <span className="text-emerald-700 font-semibold bg-emerald-50 px-1 rounded">
                            "{corr.correction}"
                          </span>
                          {corr.comment && <span className="text-neutral-500 italic">({corr.comment})</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCorrection(corr.id)}
                          className="text-neutral-400 hover:text-red-500 ml-2"
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
          <div className="space-y-2 rounded-lg border border-neutral-200 p-3 bg-neutral-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                📸 Submitted Images / Notebook Scans ({submission.images.length})
              </span>
              <span className="text-[11px] text-neutral-500">Click to enlarge</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {submission.images.map((img, idx) => (
                <div
                  key={img.id}
                  onClick={() => {
                    setLightboxIndex(idx);
                    setLightboxOpen(true);
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-lg border border-neutral-200 bg-white aspect-square hover:shadow-md transition-shadow"
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
            <p className="text-sm font-semibold text-neutral-800">Attached File / Voice Recording</p>
            <FileDownloadButton
              url={submission.file_url}
              filename={submission.file_original_name}
              className="text-sm font-medium text-brand-600 hover:underline inline-block mb-1"
            >
              📎 {submission.file_original_name ?? "Download attached file"}
            </FileDownloadButton>
            {submission.file_original_name && /\.(mp3|wav|ogg|webm|m4a)$/i.test(submission.file_original_name) && (
              <div className="mt-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-xs font-semibold text-purple-900 mb-1">🎙️ Student Voice Audio Recording</p>
                <AuthenticatedAudio url={submission.file_url} className="w-full h-9" />
              </div>
            )}
          </div>
        )}

        {/* General Comments */}
        <div className="space-y-3 rounded-lg border border-neutral-200 p-4 bg-neutral-50/50">
          <p className="text-xs font-semibold uppercase text-neutral-700 tracking-wider">
            Teacher Submission Comments
          </p>
          {comments.length > 0 && (
            <div className="space-y-2">
              {comments.map((comm) => (
                <div
                  key={comm.id}
                  className="flex items-start justify-between bg-white border border-neutral-200 rounded p-2.5 text-xs text-neutral-800"
                >
                  <div>
                    <p className="whitespace-pre-wrap">{comm.comment}</p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      {format(new Date(comm.created_at), "MMM d, HH:mm")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comm.id)}
                    className="text-neutral-400 hover:text-red-500 text-xs ml-2"
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
        <div className="space-y-4 rounded-lg border border-neutral-200 p-4 bg-neutral-50/50">
          <p className="text-xs font-semibold uppercase text-neutral-700 tracking-wider">
            Grade & Custom Stars
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-neutral-700 mb-1 block">Score (0–10)</label>
              <input
                type="number"
                min={0}
                max={10}
                className="input"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-neutral-700">Stars Awarded (0–100 ⭐)</label>
                <span className="text-xs font-bold text-amber-500">{stars} ⭐</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() => setStars((s) => Math.max(0, s - 1))}
                    className="h-9 w-9 rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition"
                    title="Decrease 1 star"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input text-center font-semibold"
                    value={stars}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, parseInt(e.target.value || "0", 10)));
                      setStars(val);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setStars((s) => Math.min(100, s + 1))}
                    className="h-9 w-9 rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition"
                    title="Increase 1 star"
                  >
                    +
                  </button>
                </div>
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1">
                  {[0, 1, 2, 5, 10, 20].map((starPreset) => (
                    <button
                      key={starPreset}
                      type="button"
                      onClick={() => setStars(starPreset)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition ${
                        stars === starPreset
                          ? "bg-amber-500 text-white border-amber-600 font-bold shadow-sm"
                          : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                      }`}
                    >
                      {starPreset}★
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-700 mb-1 block">Feedback</label>
            <textarea
              rows={3}
              className="input text-sm"
              placeholder="Overall feedback and words of encouragement..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
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

import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, StatusBadge, FileDownloadButton, AuthenticatedAudio } from "@/components/ui";
import { gradeSubmission, listGroups, listSubmissions } from "@/services/lmsService";
import { Group, SubmissionOut } from "@/types";

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
  const [stars, setStars] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (submission) {
      setScore(submission.grade?.score ?? 8);
      setStars(submission.grade?.stars ?? 4);
      setFeedback(submission.grade?.feedback ?? "");
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

  return (
    <Modal open={!!submission} onClose={onClose} title={`Grade: ${submission.student_name}`}>
      <div className="space-y-4">
        <div>
          <p className="label">Assignment</p>
          <p className="text-sm text-neutral-700">{submission.assignment_title}</p>
        </div>

        {submission.text_answer && (
          <div>
            <p className="label">Text answer</p>
            <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
              {submission.text_answer}
            </p>
          </div>
        )}

        {submission.file_url && (
          <div>
            <p className="label">Attached file</p>
            <FileDownloadButton
              url={submission.file_url}
              filename={submission.file_original_name}
              className="text-sm font-medium text-brand-600 hover:underline block mb-2"
            >
              📎 {submission.file_original_name ?? "Download file"}
            </FileDownloadButton>
            {submission.file_original_name && /\.(mp3|wav|ogg|webm)$/i.test(submission.file_original_name) && (
              <AuthenticatedAudio url={submission.file_url} className="w-full h-8" />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Score (0–10)</label>
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
            <label className="label">Stars (2–5)</label>
            <input
              type="number"
              min={2}
              max={5}
              className="input"
              value={stars}
              onChange={(e) => setStars(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="label">Feedback</label>
          <textarea rows={3} className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save grade"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

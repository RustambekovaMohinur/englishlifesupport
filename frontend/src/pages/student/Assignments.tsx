import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, StatusBadge } from "@/components/ui";
import { listMyAssignments, submitHomework } from "@/services/lmsService";
import { AssignmentForStudent } from "@/types";

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentForStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [active, setActive] = useState<AssignmentForStudent | null>(null);

  function refresh() {
    setIsLoading(true);
    listMyAssignments()
      .then(setAssignments)
      .catch(() => toast.error("Failed to load assignments"))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">My Assignments</h1>
        <p className="text-sm text-neutral-500">Homework assigned to your group</p>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : assignments.length === 0 ? (
        <EmptyState title="No assignments yet" description="You'll see homework here once your teacher assigns it." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <div key={a.id} className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-neutral-900">{a.title}</p>
                <p className="text-sm text-neutral-500">
                  Due {format(new Date(a.deadline), "MMM d, yyyy HH:mm")}
                  {a.is_past_deadline && !a.submission_status && " · Deadline passed"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {a.submission_status ? (
                  <>
                    <StatusBadge status={a.submission_status} />
                    {a.score !== null && <span className="text-sm font-medium text-neutral-700">{a.score}/10</span>}
                  </>
                ) : (
                  <StatusBadge status={a.is_locked ? "pending" : "pending"} />
                )}
                <button className="btn-secondary" onClick={() => setActive(a)} disabled={!!a.is_locked}>
                  {a.is_locked ? "Locked" : a.submission_status ? "View / Update" : "Open"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SubmitModal
        assignment={active}
        onClose={() => setActive(null)}
        onSubmitted={() => {
          setActive(null);
          refresh();
        }}
      />
    </div>
  );
}

function SubmitModal({
  assignment,
  onClose,
  onSubmitted,
}: {
  assignment: AssignmentForStudent | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setText("");
    setFile(null);
  }, [assignment]);

  if (!assignment) return null;

  const isGraded = assignment.submission_status === "graded";
  const isLocked = Boolean(assignment.is_locked) || isGraded || (assignment.is_past_deadline && !assignment.submission_status);

  async function handleSubmit() {
    if (!text && !file) {
      toast.error("Add a text answer and/or attach a file");
      return;
    }
    setIsSubmitting(true);
    try {
      await submitHomework(assignment!.id, text, file);
      toast.success("Homework submitted!");
      onSubmitted();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to submit homework");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal open={!!assignment} onClose={onClose} title={assignment.title}>
      <div className="space-y-4">
        <p className="whitespace-pre-wrap text-sm text-neutral-600">{assignment.description}</p>
        <p className="text-xs text-neutral-400">Deadline: {format(new Date(assignment.deadline), "MMM d, yyyy HH:mm")}</p>

        {isGraded && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            This submission has already been graded and can no longer be changed.
          </p>
        )}
        {isLocked && !isGraded && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            {assignment.lock_reason ?? "The deadline has passed for new submissions."}
          </p>
        )}

        {!isLocked && (
          <>
            <div>
              <label className="label">Your answer (text)</label>
              <textarea rows={4} className="input" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div>
              <label className="label">Attach a photo or file (JPG, PNG, PDF, DOC)</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.doc,.docx"
                className="input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-neutral-400">Max 10MB. You can take a photo of handwritten homework.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? "Submitting..." : "Submit homework"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

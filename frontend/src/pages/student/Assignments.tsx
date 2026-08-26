import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, StatusBadge, FileDownloadButton, AuthenticatedAudio } from "@/components/ui";
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
            <div key={a.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-semibold text-neutral-900">{a.title}</p>
                <p className="text-sm text-neutral-500">
                  Due {format(new Date(a.deadline), "MMM d, yyyy HH:mm")}
                  {a.is_past_deadline && !a.submission_status && " · Deadline passed"}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 pt-1">
                  {a.file_url && (
                    <FileDownloadButton
                      url={a.file_url}
                      filename={a.file_original_name}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                    >
                      📎 Attached Homework File ({a.file_original_name})
                    </FileDownloadButton>
                  )}
                  {a.vocab_words && a.vocab_words.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-medium">
                      📖 {a.vocab_words.length} Vocabulary Words Included
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-center">
                {a.submission_status ? (
                  <>
                    <StatusBadge status={a.submission_status} />
                    {a.score !== null && <span className="text-sm font-medium text-neutral-700">{a.score}/10</span>}
                  </>
                ) : (
                  <StatusBadge status="pending" />
                )}
                <button className="btn-secondary" onClick={() => setActive(a)}>
                  {a.submission_status ? "View / Update" : "Open Assignment"}
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
  const isLocked = isGraded || (assignment.is_past_deadline && !assignment.submission_status);
  const isAudioFile = assignment.file_original_name && /\.(mp3|wav|ogg|webm)$/i.test(assignment.file_original_name);

  async function handleSubmit() {
    if (!text && !file) {
      toast.error("Add a text answer and/or attach a file");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error("Submission file size exceeds 10 MB limit");
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
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <h4 className="text-xs font-semibold uppercase text-neutral-400">Instructions</h4>
          {(() => {
            try {
              const blocks = JSON.parse(assignment.description);
              if (Array.isArray(blocks)) {
                return (
                  <div className="mt-2 space-y-4">
                    {blocks.map((block: any, idx: number) => (
                      <div key={block.id || idx} className="p-3 bg-neutral-50 rounded border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                            {block.type}
                          </span>
                        </div>
                        {block.content && <p className="whitespace-pre-wrap text-sm text-neutral-800">{block.content}</p>}
                        {block.bookLink && (
                          <a href={block.bookLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline block mt-1">
                            Link to Book
                          </a>
                        )}
                        {block.unit && <p className="text-sm text-neutral-600 mt-1">Unit: {block.unit}</p>}
                        {block.pages && <p className="text-sm text-neutral-600 mt-1">Pages: {block.pages}</p>}
                        {block.fileName && <p className="text-sm text-neutral-500 mt-1 flex items-center gap-1">📎 {block.fileName}</p>}
                      </div>
                    ))}
                  </div>
                );
              }
            } catch (e) {
              // Not JSON, fallback to plain text
            }
            return <p className="whitespace-pre-wrap text-sm text-neutral-700 mt-1">{assignment.description}</p>;
          })()}
          <p className="text-xs text-neutral-500 mt-2">Deadline: {format(new Date(assignment.deadline), "MMM d, yyyy HH:mm")}</p>
        </div>

        {assignment.file_url && (
          <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-brand-900">Homework Document / Audio File</p>
                <p className="text-xs text-brand-700">{assignment.file_original_name}</p>
              </div>
              <FileDownloadButton
                url={assignment.file_url}
                filename={assignment.file_original_name}
                className="btn-sm btn-primary"
              >
                Download File
              </FileDownloadButton>
            </div>
            {isAudioFile && (
              <div className="pt-2">
                <AuthenticatedAudio url={assignment.file_url} className="w-full h-8" />
              </div>
            )}
          </div>
        )}

        {assignment.vocab_words && assignment.vocab_words.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <h4 className="text-xs font-semibold uppercase text-purple-700 flex items-center gap-1">
              📖 Assignment Vocabulary ({assignment.vocab_words.length} words)
            </h4>
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y bg-neutral-50">
              {assignment.vocab_words.map((word) => (
                <div key={word.id} className="p-2 text-xs flex justify-between items-center">
                  <span className="font-semibold text-neutral-900">{word.english_word}</span>
                  <span className="text-neutral-600 font-medium">{word.translation}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isGraded && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            This submission has already been graded and can no longer be changed.
            {assignment.score !== null && (
              <p className="font-bold mt-1">Your Grade: {assignment.score}/10</p>
            )}
          </div>
        )}
        {isLocked && !isGraded && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">The deadline has passed for new submissions.</div>
        )}

        {!isLocked && (
          <div className="space-y-4 border-t pt-3">
            <h4 className="text-xs font-semibold uppercase text-neutral-500">Your Homework Submission</h4>
            <div>
              <label className="label">Your answer (text)</label>
              <textarea rows={4} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer here..." />
            </div>
            <div>
              <label className="label">Attach file or audio recording (max 10MB)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.heic,.mp3,.wav,.ogg,.webm,.txt"
                className="input text-xs"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-neutral-400">Max 10MB. Document, photo, or audio recording supported.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? "Submitting..." : "Submit Homework"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

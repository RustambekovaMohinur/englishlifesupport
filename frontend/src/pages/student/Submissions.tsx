import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, StatusBadge, FileDownloadButton } from "@/components/ui";
import { listMySubmissions } from "@/services/lmsService";
import { SubmissionOut } from "@/types";

export default function StudentSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listMySubmissions()
      .then(setSubmissions)
      .catch(() => toast.error("Failed to load submissions"))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">My Submissions</h1>
        <p className="text-sm text-neutral-500">Everything you've turned in</p>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : submissions.length === 0 ? (
        <EmptyState title="No submissions yet" description="Submit your first assignment to see it here." />
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className="card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-neutral-900">{s.assignment_title}</p>
                  <p className="text-sm text-neutral-500">Submitted {format(new Date(s.submitted_at), "MMM d, yyyy HH:mm")}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              {s.text_answer && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-600">{s.text_answer}</p>}
              {s.file_url && (
                <FileDownloadButton
                  url={s.file_url}
                  filename={s.file_original_name}
                  className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
                >
                  📎 {s.file_original_name ?? "View attached file"}
                </FileDownloadButton>
              )}
              {s.grade && (
                <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm">
                  <p className="font-medium text-neutral-800">
                    Score: {s.grade.score}/10 · {"⭐".repeat(s.grade.stars)}
                  </p>
                  {s.grade.feedback && <p className="mt-1 text-neutral-600">{s.grade.feedback}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

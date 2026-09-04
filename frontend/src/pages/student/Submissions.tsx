import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, StatusBadge, FileDownloadButton, AuthenticatedAudio } from "@/components/ui";
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
        <p className="text-sm text-neutral-500">Everything you've turned in and teacher feedback</p>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : submissions.length === 0 ? (
        <EmptyState title="No submissions yet" description="Submit your first assignment to see it here." />
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <div key={s.id} className="card space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-2.5">
                <div>
                  <p className="font-semibold text-neutral-900 text-base">{s.assignment_title}</p>
                  <p className="text-xs text-neutral-500">Submitted {format(new Date(s.submitted_at), "MMM d, yyyy HH:mm")}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>

              {/* Student text answer */}
              {s.text_answer && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Your Answer</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-sm text-neutral-800 leading-relaxed">
                    {s.text_answer}
                  </p>
                </div>
              )}

              {/* Teacher Corrections on text answer */}
              {s.corrections && s.corrections.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">✏️</span>
                    <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider">
                      Teacher Error Corrections ({s.corrections.length})
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {s.corrections.map((corr) => (
                      <div
                        key={corr.id}
                        className="flex items-center gap-2 bg-white border border-amber-200 rounded p-2 text-xs flex-wrap"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium text-[11px] capitalize">
                          {corr.error_type || "Correction"}
                        </span>
                        <span className="line-through text-red-600 font-medium">"{corr.selected_text}"</span>
                        <span className="text-neutral-400">➔</span>
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                          "{corr.correction}"
                        </span>
                        {corr.comment && (
                          <span className="text-neutral-600 italic border-l pl-2 border-neutral-300">
                            {corr.comment}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attached file & audio preview */}
              {s.file_url && (
                <div className="space-y-1 pt-1">
                  <FileDownloadButton
                    url={s.file_url}
                    filename={s.file_original_name}
                    className="inline-block text-xs font-medium text-brand-600 hover:underline"
                  >
                    📎 {s.file_original_name ?? "Download submission file"}
                  </FileDownloadButton>
                  {s.file_original_name && /\.(mp3|wav|ogg|webm)$/i.test(s.file_original_name) && (
                    <div className="mt-1">
                      <AuthenticatedAudio url={s.file_url} className="w-full h-8" />
                    </div>
                  )}
                </div>
              )}

              {/* Teacher Comments */}
              {s.comments && s.comments.length > 0 && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Teacher Notes & Comments
                  </p>
                  <div className="space-y-1">
                    {s.comments.map((c) => (
                      <div key={c.id} className="text-xs text-neutral-800 bg-white border border-neutral-200 rounded p-2">
                        <p className="whitespace-pre-wrap">{c.comment}</p>
                        <p className="text-[10px] text-neutral-400 mt-1">
                          {format(new Date(c.created_at), "MMM d, HH:mm")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grade card */}
              {s.grade && (
                <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3.5 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-900">
                      Score: <span className="text-emerald-700 font-bold">{s.grade.score}/10</span>
                    </span>
                    <span className="font-semibold text-amber-600 flex items-center gap-1">
                      {s.grade.stars} ⭐
                    </span>
                  </div>
                  {s.grade.feedback && (
                    <p className="text-xs text-neutral-700 whitespace-pre-wrap pt-1 border-t border-emerald-200/60">
                      <span className="font-medium text-neutral-800">Feedback: </span>
                      {s.grade.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  EmptyState,
  LoadingRows,
  StatusBadge,
  FileDownloadButton,
  AuthenticatedAudio,
  AuthenticatedImage,
  ImageLightbox,
} from "@/components/ui";
import { listMySubmissions } from "@/services/lmsService";
import { SubmissionOut } from "@/types";

export default function StudentSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [selectedImages, setSelectedImages] = useState<{ url: string; name?: string }[]>([]);

  useEffect(() => {
    listMySubmissions()
      .then(setSubmissions)
      .catch(() => toast.error("Failed to load submissions"))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">My Submissions</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Everything you've turned in and teacher feedback</p>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : submissions.length === 0 ? (
        <EmptyState title="No submissions yet" description="Submit your first assignment to see it here." />
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <div key={s.id} className="card space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white text-base">{s.assignment_title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Submitted {format(new Date(s.submitted_at), "MMM d, yyyy HH:mm")}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>

              {/* Student text answer */}
              {s.text_answer && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Your Answer</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    {s.text_answer}
                  </p>
                </div>
              )}

              {/* Teacher Corrections on text answer */}
              {s.corrections && s.corrections.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">✏️</span>
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                      Teacher Error Corrections ({s.corrections.length})
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {s.corrections.map((corr) => (
                      <div
                        key={corr.id}
                        className="flex items-center gap-2 bg-white dark:bg-[#161B22] border border-amber-500/20 rounded p-2 text-xs flex-wrap"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-medium text-[11px] capitalize">
                          {corr.error_type || "Correction"}
                        </span>
                        <span className="line-through text-red-600 dark:text-red-400 font-medium">"{corr.selected_text}"</span>
                        <span className="text-zinc-400 dark:text-zinc-500">➔</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                          "{corr.correction}"
                        </span>
                        {corr.comment && (
                          <span className="text-zinc-600 dark:text-zinc-400 italic border-l pl-2 border-zinc-300 dark:border-zinc-700">
                            {corr.comment}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attached images from student */}
              {s.images && s.images.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Attached Photos ({s.images.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {s.images.map((img, idx) => (
                      <div
                        key={img.id}
                        onClick={() => {
                          setSelectedImages(
                            (s.images || []).map((item) => ({
                              url: `/api/submissions/${s.id}/images/${item.id}`,
                              name: item.original_name,
                            }))
                          );
                          setLightboxIndex(idx);
                          setLightboxOpen(true);
                        }}
                        className="group relative cursor-pointer overflow-hidden rounded border border-zinc-200 dark:border-zinc-800 aspect-square bg-white dark:bg-zinc-900 hover:shadow-md transition"
                      >
                        <AuthenticatedImage
                          url={`/api/submissions/${s.id}/images/${img.id}`}
                          alt={img.original_name}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
                            🔍 View
                          </span>
                        </div>
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
                    className="inline-block text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    📎 {s.file_original_name ?? "Download submission file"}
                  </FileDownloadButton>
                  {s.file_original_name && /\.(mp3|wav|ogg|webm|m4a)$/i.test(s.file_original_name) && (
                    <div className="mt-1 p-2 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800">
                      <p className="text-xs font-semibold text-purple-900 dark:text-purple-300 mb-1">🎙️ Speaking Voice Recording</p>
                      <AuthenticatedAudio url={s.file_url} className="w-full h-8" />
                    </div>
                  )}
                </div>
              )}

              {/* Teacher Comments */}
              {s.comments && s.comments.length > 0 && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Teacher Notes & Comments
                  </p>
                  <div className="space-y-1">
                    {s.comments.map((c) => (
                      <div key={c.id} className="text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-[#161B22] border border-zinc-200 dark:border-zinc-800 rounded p-2">
                        <p className="whitespace-pre-wrap">{c.comment}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                          {format(new Date(c.created_at), "MMM d, HH:mm")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grade card */}
              {s.grade && (
                <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 p-3.5 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      Score: <span className="text-emerald-700 dark:text-emerald-400 font-bold font-mono">{s.grade.score}/10</span>
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                      {s.grade.stars} ⭐
                    </span>
                  </div>
                  {s.grade.feedback && (
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">Feedback: </span>
                      {s.grade.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ImageLightbox
        isOpen={lightboxOpen}
        images={selectedImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}

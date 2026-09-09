import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  X,
  Award,
  Star,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Volume2,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  AuthenticatedAudio,
  AuthenticatedImage,
  FileDownloadButton,
  ImageLightbox,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { getSubmission, gradeSubmission } from "@/services/lmsService";
import { SubmissionOut } from "@/types";

interface SubmissionReviewDrawerProps {
  submissionId: string | null;
  onClose: () => void;
  onGraded?: (submissionId: string, score: number, stars: number, feedback?: string) => void;
}

export const SubmissionReviewDrawer: React.FC<SubmissionReviewDrawerProps> = ({
  submissionId,
  onClose,
  onGraded,
}) => {
  const [submission, setSubmission] = useState<SubmissionOut | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [score, setScore] = useState<number>(10);
  const [stars, setStars] = useState<number>(10);
  const [feedback, setFeedback] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!submissionId) {
      setSubmission(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    getSubmission(submissionId)
      .then((data) => {
        if (!isMounted) return;
        setSubmission(data);
        if (data.grade) {
          setScore(data.grade.score ?? 10);
          setStars(data.grade.stars ?? 10);
          setFeedback(data.grade.feedback ?? "");
        } else {
          setScore(10);
          setStars(10);
          setFeedback("");
        }
      })
      .catch((err) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load submission details");
        onClose();
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [submissionId]);

  if (!submissionId) return null;

  async function handleGradeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submission) return;

    setIsSubmitting(true);
    try {
      await gradeSubmission(submission.id, {
        score: Number(score),
        stars: Number(stars),
        feedback: feedback.trim() || undefined,
      });

      toast.success("Grade & feedback saved successfully!");
      if (onGraded) {
        onGraded(submission.id, Number(score), Number(stars), feedback.trim());
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save grade");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isAudio = Boolean(
    submission?.file_original_name &&
      /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(submission.file_original_name)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Slide-out Drawer Panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
        <aside className="w-screen max-w-xl bg-white dark:bg-[#111827] shadow-2xl border-l border-zinc-200/80 dark:border-zinc-800 flex flex-col transform transition-transform animate-in slide-in-from-right duration-300">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 sticky top-0 z-10">
            <div className="min-w-0 pr-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Quick Homework Review
              </span>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate mt-0.5">
                {submission ? submission.assignment_title : "Loading..."}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading || !submission ? (
              <div className="flex flex-col items-center justify-center h-64 space-y-3">
                <Spinner className="w-8 h-8 text-indigo-600" />
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Retrieving student submission...
                </p>
              </div>
            ) : (
              <>
                {/* Student Info Pill Card */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0">
                      {submission.student_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {submission.student_name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        Submitted: {format(new Date(submission.submitted_at), "MMM d, yyyy · HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <StatusBadge status={submission.status} />
                  </div>
                </div>

                {/* Submission Artifacts */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span>Submitted Work</span>
                  </h3>

                  {/* Audio Player if Audio Submission */}
                  {submission.file_url && isAudio && (
                    <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                          <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>Voice Recording / Speaking Task</span>
                        </span>
                        {submission.file_original_name && (
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[180px]">
                            {submission.file_original_name}
                          </span>
                        )}
                      </div>
                      <AuthenticatedAudio
                        url={`/submissions/${submission.id}/file`}
                        className="w-full mt-1"
                      />
                    </div>
                  )}

                  {/* Document Download if non-audio attachment */}
                  {submission.file_url && !isAudio && (
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {submission.file_original_name || "Attached Homework Document"}
                        </span>
                      </div>
                      <FileDownloadButton
                        url={`/submissions/${submission.id}/file`}
                        filename={submission.file_original_name || "homework-file"}
                        className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                      >
                        Download File
                      </FileDownloadButton>
                    </div>
                  )}

                  {/* Text Answer */}
                  {submission.text_answer && (
                    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/60 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Written Response / Notes
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(submission.text_answer || "");
                            toast.success("Copied to clipboard");
                          }}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto font-sans p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800">
                        {submission.text_answer}
                      </div>
                    </div>
                  )}

                  {/* Photo Scans / Uploaded Images */}
                  {submission.images && submission.images.length > 0 && (
                    <div className="space-y-2 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900/40">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4 text-purple-500" />
                          <span>Notebook Scans & Photos ({submission.images.length})</span>
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Click to enlarge
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                        {submission.images.map((img, idx) => (
                          <div
                            key={img.id}
                            onClick={() => setLightboxIndex(idx)}
                            className="aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition shadow-2xs group relative bg-black/5"
                          >
                            <AuthenticatedImage
                              url={`/submissions/${submission.id}/images/${img.id}`}
                              alt={`Notebook scan ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <ExternalLink className="w-4 h-4 drop-shadow" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!submission.file_url &&
                    !submission.text_answer &&
                    (!submission.images || submission.images.length === 0) && (
                      <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800/40 text-xs text-zinc-500 text-center">
                        No direct text or attachments provided with this submission record.
                      </div>
                    )}
                </div>

                {/* Teacher Evaluation & Grading Section */}
                <form
                  onSubmit={handleGradeSubmit}
                  className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 p-4 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900/40 pb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Examiner Evaluation</span>
                    </h3>
                    {submission.grade && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        Previously Graded
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label text-xs text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                        <span>Score (0 – 10) *</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {score}/10
                        </span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={score}
                        onChange={(e) => setScore(Number(e.target.value))}
                        className="input text-base font-mono font-bold tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <label className="label text-xs text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                        <span>Reward Stars *</span>
                        <span className="font-mono font-bold text-amber-500">
                          +{stars} ⭐
                        </span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={1}
                        value={stars}
                        onChange={(e) => setStars(Number(e.target.value))}
                        className="input text-base font-mono font-bold tabular-nums"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label text-xs text-zinc-700 dark:text-zinc-300">
                      Examiner Feedback & Corrections
                    </label>
                    <textarea
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="e.g. Excellent fluency and range of lexical resource. Pay attention to past tense third person."
                      className="input text-xs resize-none"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn-secondary text-xs px-4 py-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary text-xs px-5 py-2 font-semibold flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner className="w-3.5 h-3.5" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Save Evaluation</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

          {/* Lightbox for Enlargeable Images */}
          {submission?.images && lightboxIndex !== null && (
            <ImageLightbox
              isOpen={lightboxIndex !== null}
              images={submission.images.map((img, idx) => ({
                url: `/submissions/${submission.id}/images/${img.id}`,
                name: `Scan ${idx + 1}`,
              }))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
};

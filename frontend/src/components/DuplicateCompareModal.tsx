import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldAlert,
  ShieldCheck,
  X,
  ExternalLink,
  ZoomIn,
} from "lucide-react";
import { AuthenticatedImage, FileDownloadButton, ImageLightbox, Spinner } from "@/components/ui";
import {
  getDuplicateComparison,
  markSubmissionCheated,
  dismissSubmissionFlag,
} from "@/services/lmsService";
import { DuplicateCompareOut } from "@/types";

interface DuplicateCompareModalProps {
  isOpen: boolean;
  submissionId: string | null;
  onClose: () => void;
  onFlagDismissed?: () => void;
  onMarkedCheated?: () => void;
}

export default function DuplicateCompareModal({
  isOpen,
  submissionId,
  onClose,
  onFlagDismissed,
  onMarkedCheated,
}: DuplicateCompareModalProps) {
  const [data, setData] = useState<DuplicateCompareOut | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [penaltyStars, setPenaltyStars] = useState(15);
  const [customNote, setCustomNote] = useState("");
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && submissionId) {
      setIsLoading(true);
      setData(null);
      getDuplicateComparison(submissionId)
        .then((res) => {
          setData(res);
        })
        .catch((err: any) => {
          toast.error(err?.response?.data?.detail || "Could not load duplicate comparison details");
          onClose();
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, submissionId]);

  if (!isOpen) return null;

  async function handleMarkCheated() {
    if (!submissionId) return;
    if (!confirm(`Are you sure you want to mark this submission as a duplicate copy and deduct ${penaltyStars} stars from the student?`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await markSubmissionCheated(submissionId, penaltyStars, customNote || undefined);
      toast.success("Submission marked as duplicate copy and rejected!");
      if (onMarkedCheated) onMarkedCheated();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to mark submission as cheated");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDismissFlag() {
    if (!submissionId) return;
    if (!confirm("Are you sure you want to dismiss this flag and verify the submission as authentic?")) {
      return;
    }
    setIsProcessing(true);
    try {
      await dismissSubmissionFlag(submissionId);
      toast.success("Duplicate flag dismissed!");
      if (onFlagDismissed) onFlagDismissed();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to dismiss flag");
    } finally {
      setIsProcessing(false);
    }
  }

  const simPct = data ? Math.round(data.similarity_score * 100) : 0;
  const isExact = simPct >= 99;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-[#121824] border border-zinc-200/80 dark:border-zinc-800 shadow-2xl text-zinc-900 dark:text-zinc-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3 bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white truncate">
                  Anti-Cheat: Duplicate Submission Review
                </h2>
                {data && (
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                      isExact
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                        : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
                    }`}
                  >
                    <span>{isExact ? "🔴 100% Exact Match / Duplicate" : `🚨 ${simPct}% Similarity Detected`}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                Perceptual hashing (dHash) and SHA-256 fingerprint comparison
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Spinner className="w-8 h-8 text-rose-500" />
              <p className="text-xs text-zinc-500 font-medium">Extracting perceptual comparison...</p>
            </div>
          ) : !data ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No comparison data available.
            </div>
          ) : (
            <>
              {/* Alert Reason Banner */}
              <div className="p-3.5 rounded-2xl bg-rose-500/10 dark:bg-rose-950/30 border border-rose-500/20 text-xs sm:text-sm text-rose-900 dark:text-rose-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {data.flag_reason || `High similarity (${simPct}%) submission detected.`}
                  </p>
                  <p className="text-xs text-rose-700/90 dark:text-rose-300/80 leading-relaxed">
                    Compare the submitted images, files, and timestamps below to verify whether this work was copied from another student's assignment.
                  </p>
                </div>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Left: Current Student (Suspected Copy) */}
                <div className="flex flex-col rounded-2xl border-2 border-rose-300/80 dark:border-rose-500/40 bg-rose-50/20 dark:bg-rose-950/15 overflow-hidden shadow-xs">
                  <div className="p-3.5 bg-rose-500/10 dark:bg-rose-900/30 border-b border-rose-200 dark:border-rose-800/60 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 font-mono">
                        Suspected Copy (Current Student)
                      </span>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {data.current.student_name}
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                      {format(new Date(data.current.submitted_at), "MMM d, HH:mm")}
                    </span>
                  </div>

                  <div className="p-4 space-y-4 flex-1">
                    {/* Images Viewer */}
                    <div>
                      <span className="block text-[11px] font-bold uppercase text-zinc-400 font-mono mb-2">
                        Submitted Images ({data.current.image_urls.length})
                      </span>
                      {data.current.image_urls.length === 0 ? (
                        <div className="p-6 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 text-center text-xs text-zinc-400">
                          No images attached
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {data.current.image_urls.map((imgUrl, i) => (
                            <div
                              key={i}
                              className="relative group/img rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-black/5 aspect-4/3 cursor-pointer"
                              onClick={() => setActiveLightboxImg(imgUrl)}
                            >
                              <AuthenticatedImage
                                url={imgUrl}
                                alt={`Current student image ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                                <ZoomIn className="w-4 h-4" />
                                <span>Enlarge</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Primary File (if non-image like PDF/DOC) */}
                    {data.current.file_url && (
                      <div className="pt-2">
                        <span className="block text-[11px] font-bold uppercase text-zinc-400 font-mono mb-1.5">
                          Attached File
                        </span>
                        <FileDownloadButton
                          url={data.current.file_url}
                          filename={data.current.file_original_name}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-brand-600 dark:text-brand-400 hover:bg-zinc-50"
                        >
                          <FileText className="w-4 h-4" />
                          <span>{data.current.file_original_name || "Download File"}</span>
                        </FileDownloadButton>
                      </div>
                    )}

                    {/* Text Answer */}
                    {data.current.text_answer && (
                      <div className="pt-2">
                        <span className="block text-[11px] font-bold uppercase text-zinc-400 font-mono mb-1.5">
                          Written Response
                        </span>
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-36 overflow-y-auto font-sans leading-relaxed">
                          {data.current.text_answer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Original Peer Submission */}
                <div className="flex flex-col rounded-2xl border-2 border-emerald-300/80 dark:border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/15 overflow-hidden shadow-xs">
                  <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-900/30 border-b border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-mono">
                        Original Submission (Earlier Student)
                      </span>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {data.original.student_name}
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                      {format(new Date(data.original.submitted_at), "MMM d, HH:mm")}
                    </span>
                  </div>

                  <div className="p-4 space-y-4 flex-1">
                    {/* Images Viewer */}
                    <div>
                      <span className="block text-[11px] font-bold uppercase text-zinc-400 font-mono mb-2">
                        Original Images ({data.original.image_urls.length})
                      </span>
                      {data.original.image_urls.length === 0 ? (
                        <div className="p-6 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 text-center text-xs text-zinc-400">
                          No images attached
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {data.original.image_urls.map((imgUrl, i) => (
                            <div
                              key={i}
                              className="relative group/img rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-black/5 aspect-4/3 cursor-pointer"
                              onClick={() => setActiveLightboxImg(imgUrl)}
                            >
                              <AuthenticatedImage
                                url={imgUrl}
                                alt={`Original student image ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                                <ZoomIn className="w-4 h-4" />
                                <span>Enlarge</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Primary File */}
                    {data.original.file_url && (
                      <div className="pt-2">
                        <span className="block text-[11px] font-bold uppercase text-zinc-400 font-mono mb-1.5">
                          Attached File
                        </span>
                        <FileDownloadButton
                          url={data.original.file_url}
                          filename={data.original.file_original_name}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-brand-600 dark:text-brand-400 hover:bg-zinc-50"
                        >
                          <FileText className="w-4 h-4" />
                          <span>{data.original.file_original_name || "Download File"}</span>
                        </FileDownloadButton>
                      </div>
                    )}

                    {/* Text Answer */}
                    {data.original.text_answer && (
                      <div className="pt-2">
                        <span className="block text-[11px] font-bold uppercase text-zinc-400 font-mono mb-1.5">
                          Written Response
                        </span>
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-36 overflow-y-auto font-sans leading-relaxed">
                          {data.original.text_answer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Teacher Decision Section */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Teacher Decision & Penalty
                    </h4>
                    <p className="text-[11px] text-zinc-500">
                      If confirmed as duplicate, assign 0 score and deduct stars, or dismiss the flag if verified authentic.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-500 font-medium">Penalty:</span>
                    <select
                      value={penaltyStars}
                      onChange={(e) => setPenaltyStars(Number(e.target.value))}
                      className="px-2.5 py-1 text-xs font-bold font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                    >
                      <option value="0">0 ⭐ No Penalty</option>
                      <option value="10">-10 ⭐ Light Penalty</option>
                      <option value="15">-15 ⭐ Standard Penalty</option>
                      <option value="25">-25 ⭐ Strict Penalty</option>
                    </select>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Warning note or explanation for the student (e.g. 'Please complete homework independently in your own notebook')..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500/30"
                />
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-zinc-200/80 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition"
          >
            Close
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={isProcessing || !data}
              onClick={handleDismissFlag}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Dismiss Flag (Authentic)</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || !data}
              onClick={handleMarkCheated}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 active:scale-95 text-white shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Reject & Mark Duplicate ({penaltyStars > 0 ? `-${penaltyStars} ⭐` : "0 ⭐"})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox for full image viewing */}
      <ImageLightbox
        isOpen={Boolean(activeLightboxImg)}
        images={activeLightboxImg ? [{ url: activeLightboxImg, name: "Homework comparison enlarged" }] : []}
        onClose={() => setActiveLightboxImg(null)}
      />
    </div>
  );
}

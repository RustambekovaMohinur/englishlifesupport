import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { format } from "date-fns";
import { Loader2, UploadCloud, FileText, Image as ImageIcon, X } from "lucide-react";
import {
  EmptyState,
  LoadingRows,
  Modal,
  FileDownloadButton,
  AuthenticatedAudio,
  AuthenticatedImage,
  ImageLightbox,
  VoiceRecorder,
} from "@/components/ui";
import { listMyAssignments, submitHomework, useFreePass, recordVocabPractice } from "@/services/lmsService";
import { AssignmentForStudent } from "@/types";
import toast from "react-hot-toast";

export function TaskStatusBadge({ assignment }: { assignment: AssignmentForStudent }) {
  if (assignment.submission_status === "graded") {
    return (
      <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1 shadow-xs">
        ✓ DONE {assignment.score !== null ? `${assignment.score}/10` : ""}
      </span>
    );
  }
  if (assignment.submission_status === "submitted" || assignment.submission_status === "late") {
    return (
      <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1.5 shadow-xs">
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        PENDING
      </span>
    );
  }
  return (
    <span className="bg-zinc-100/70 dark:bg-zinc-800/40 text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50 font-mono font-medium rounded-full px-2.5 py-0.5 text-xs inline-flex items-center gap-1">
      ○ NOT YET
    </span>
  );
}

function getSkillBadge(title: string) {
  const t = title.toLowerCase();
  if (t.includes("read") || t.includes("book") || t.includes("article") || t.includes("text")) {
    return { icon: "📖", bg: "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60" };
  }
  if (t.includes("listen") || t.includes("audio") || t.includes("podcast")) {
    return { icon: "🎧", bg: "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60" };
  }
  if (t.includes("speak") || t.includes("voice") || t.includes("oral") || t.includes("record")) {
    return { icon: "🎙️", bg: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60" };
  }
  if (t.includes("writ") || t.includes("essay") || t.includes("grammar") || t.includes("vocab")) {
    return { icon: "✍️", bg: "bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60" };
  }
  return { icon: "⚡", bg: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60" };
}

export default function StudentAssignmentsPage() {
  const location = useLocation();
  const isVocabRoute = location.pathname.includes("vocabulary");
  const [assignments, setAssignments] = useState<AssignmentForStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [active, setActive] = useState<AssignmentForStudent | null>(null);
  const [applyingPassId, setApplyingPassId] = useState<string | null>(null);

  const displayedAssignments = isVocabRoute
    ? assignments.filter((a) => a.vocab_words && a.vocab_words.length > 0)
    : assignments;

  function refresh() {
    setIsLoading(true);
    listMyAssignments()
      .then(setAssignments)
      .catch(() => toast.error("Failed to load assignments"))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, []);

  async function handleApplyFreePass(assignmentId: string) {
    if (!confirm("Use your 1 Monthly Free Pass on this assignment? It will waive the penalty and unlock progression.")) {
      return;
    }
    setApplyingPassId(assignmentId);
    try {
      const res = await useFreePass(assignmentId);
      toast.success(res.message || "Free Pass applied!");
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not apply Free Pass");
    } finally {
      setApplyingPassId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {isVocabRoute ? "Vocabulary Word Lists & Practice 📖" : "My Assignments & Learning Tasks"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isVocabRoute
              ? "Master vocabulary lists, take quizzes, and earn +15 XP / +10 ⭐"
              : "Sequential homework progression, tasks and vocabulary"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-3 py-1.5 rounded-lg font-medium border border-brand-200 dark:border-brand-800">
          <span>⚡ +10 ⭐ On-time</span>
          <span>·</span>
          <span>🚀 +5 ⭐ Early</span>
          <span>·</span>
          <span>-20 ⭐ Late</span>
        </div>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : displayedAssignments.length === 0 ? (
        <EmptyState
          title={isVocabRoute ? "No vocabulary lists yet" : "No assignments yet"}
          description={
            isVocabRoute
              ? "Vocabulary lists will appear here once your teacher attaches words to assignments."
              : "You'll see homework here once your teacher assigns it."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {displayedAssignments.map((a) => {
            const skillBadge = getSkillBadge(a.title);
            return (
              <div key={a.id}>
                {/* Mobile High-Density Task Row (< 640px) */}
                <div
                  className={`sm:hidden flex items-center justify-between p-3 rounded-xl border transition-all ${
                    a.is_locked
                      ? "bg-zinc-50/80 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800/80 opacity-80"
                      : "bg-white dark:bg-[#161B22] border-zinc-200/70 dark:border-zinc-800/70 shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border text-base ${skillBadge.bg}`}>
                      {skillBadge.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-zinc-900 dark:text-white text-xs truncate max-w-[170px]">
                          {a.title}
                        </p>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0">
                          C{a.cycle_number ?? 1}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                        Due: {format(new Date(a.deadline), "MMM d, HH:mm")}
                        {a.submission_status && (
                          <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">
                            · {a.submission_status === "graded" && a.score !== null ? `${a.score}/10` : a.submission_status}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {((a.is_past_deadline && !a.submission_status) || a.is_locked) && (
                      <button
                        className="px-2 py-1 text-[10px] font-semibold rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 active:scale-95 transition-transform"
                        disabled={applyingPassId === a.id}
                        onClick={() => handleApplyFreePass(a.id)}
                        title="1 Monthly Free Pass"
                      >
                        {applyingPassId === a.id ? "..." : "🛡 Pass"}
                      </button>
                    )}
                    <button
                      className={`px-3 py-1 text-xs font-semibold rounded-full active:scale-95 transition-transform ${
                        a.is_locked
                          ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
                      }`}
                      disabled={a.is_locked}
                      onClick={() => setActive(a)}
                    >
                      {a.submission_status ? (a.submission_status === "graded" ? "View" : "Edit") : a.is_locked ? "Locked" : "Open"}
                    </button>
                  </div>
                </div>

                {/* Desktop / Tablet Full Card (>= 640px) */}
                <div
                  className={`hidden sm:flex sm:flex-row sm:items-center sm:justify-between card p-4 gap-3 border transition-all duration-150 ${
                    a.is_locked
                      ? "bg-zinc-50/80 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800/80 opacity-85"
                      : "bg-white dark:bg-[#111827] border-black/[0.06] dark:border-white/[0.08] hover:border-indigo-500/40 hover:-translate-y-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-zinc-900 dark:text-white text-sm tracking-tight">{a.title}</p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                        Cycle {a.cycle_number ?? 1}
                      </span>
                      {a.prerequisite_id && (
                        <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                          Prerequisite Required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums font-mono">
                      Due: {format(new Date(a.deadline), "MMM d, yyyy HH:mm")}
                      {a.is_overdue && " · 🔴 Overdue (Penalty applied)"}
                      {!a.is_overdue && a.is_past_deadline && !a.submission_status && " · Deadline passed"}
                      {a.is_locked && a.lock_reason && ` · 🔒 ${a.lock_reason}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                      {a.file_url && (
                        <FileDownloadButton
                          url={a.file_url}
                          filename={a.file_original_name}
                          className="inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          📎 Attached ({a.file_original_name})
                        </FileDownloadButton>
                      )}
                      {a.vocab_words && a.vocab_words.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded font-medium text-[11px] border border-purple-200 dark:border-purple-800/50">
                          📖 {a.vocab_words.length} Vocab
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded font-medium text-[11px] border border-amber-200 dark:border-amber-800/50">
                        ⭐ +10 Stars · 🎯 +25 XP
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <TaskStatusBadge assignment={a} />
                    {a.score !== null && (
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tabular-nums font-mono">{a.score}/10</span>
                    )}

                    {/* Free Pass CTA for missed/late tasks */}
                    {((a.is_past_deadline && !a.submission_status) || a.is_locked) && (
                      <button
                        className="btn-sm bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-xs px-2.5 py-1"
                        disabled={applyingPassId === a.id}
                        onClick={() => handleApplyFreePass(a.id)}
                        title="Use your 1 Monthly Free Pass to bypass lock/penalty"
                      >
                        {applyingPassId === a.id ? "Using..." : "🛡 Free Pass"}
                      </button>
                    )}

                    <button
                      className={
                        a.is_locked
                          ? "btn-secondary text-xs px-3 py-1.5 opacity-60 cursor-not-allowed"
                          : "btn-secondary text-xs px-3 py-1.5"
                      }
                      disabled={a.is_locked}
                      onClick={() => setActive(a)}
                    >
                      {a.submission_status ? "View / Update" : a.is_locked ? "Locked" : "Open Task"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
  const [submissionImages, setSubmissionImages] = useState<File[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dropzoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText("");
    setFile(null);
    setSubmissionImages([]);
    setVoiceFile(null);
    setIsDragging(false);
  }, [assignment]);

  // Handle files added via drop, file picker, or clipboard paste
  function handleFilesAdded(incomingFiles: File[]) {
    const allowedDocExts = /\.(pdf|docx?|txt)$/i;
    const allowedImgExts = /\.(png|jpe?g|webp|heic)$/i;
    const newImages: File[] = [];
    let newDoc: File | null = null;

    for (const f of incomingFiles) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds 10MB limit`);
        continue;
      }
      const isImg = f.type.startsWith("image/") || allowedImgExts.test(f.name);
      const isDoc = allowedDocExts.test(f.name);

      if (!isImg && !isDoc) {
        toast.error(`"${f.name}" is not supported. Please upload PDF, DOCX, PNG, JPG, or WEBP.`);
        continue;
      }

      if (isImg) {
        newImages.push(f);
      } else {
        newDoc = f;
      }
    }

    if (newDoc) {
      setFile(newDoc);
      toast.success(`Attached document: ${newDoc.name}`);
    }

    if (newImages.length > 0) {
      setSubmissionImages((prev) => {
        if (prev.length >= 10) {
          toast.error("Maximum 10 images allowed per submission");
          return prev;
        }
        const remainingSlots = 10 - prev.length;
        const toAdd = newImages.slice(0, remainingSlots);
        if (newImages.length > remainingSlots) {
          toast.error(`Only ${remainingSlots} more image(s) could be added (max 10)`);
        } else {
          toast.success(`Added ${toAdd.length} image(s)`);
        }
        return [...prev, ...toAdd];
      });
    }
  }

  // Global clipboard screenshot paste listener
  useEffect(() => {
    if (!assignment) return;

    function handleGlobalPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const rawFile = item.getAsFile();
          if (rawFile) {
            const ext = rawFile.type.split("/")[1] || "png";
            const named = new File([rawFile], `screenshot_${Date.now()}.${ext}`, { type: rawFile.type });
            pastedFiles.push(named);
          }
        }
      }
      if (pastedFiles.length > 0) {
        handleFilesAdded(pastedFiles);
      }
    }

    window.addEventListener("paste", handleGlobalPaste);
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, [assignment]);

  if (!assignment) return null;

  const isGraded = assignment.submission_status === "graded";
  const isLocked = isGraded || (assignment.is_past_deadline && !assignment.submission_status);
  const isAudioFile = assignment.file_original_name && /\.(mp3|wav|ogg|webm)$/i.test(assignment.file_original_name);

  async function handleSubmit() {
    if (!text && !file && !voiceFile && submissionImages.length === 0) {
      toast.error("Please provide a text answer, audio, file, or images");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error("Submission file size exceeds 10 MB limit");
      return;
    }

    setIsSubmitting(true);
    try {
      // Prioritize voiceFile as the primary file if no other document was selected
      const effectiveFile = file || voiceFile;
      await submitHomework(assignment!.id, text, effectiveFile, submissionImages);
      toast.success("Homework submitted successfully!");
      onSubmitted();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to submit homework");
    } finally {
      setIsSubmitting(false);
    }
  }

  const galleryImages = (assignment.images || []).map((img) => ({
    url: `/api/assignments/${assignment.id}/images/${img.id}`,
    name: img.original_name,
  }));

  return (
    <>
      {/* Fast-Submit Modal Flex Architecture strictly in z-[70] */}
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
        <div className="fixed inset-0 bg-transparent" onClick={onClose} />
        <div className="relative z-10 flex flex-col max-h-[88vh] w-full sm:max-w-2xl bg-white dark:bg-[#161B22] rounded-t-3xl sm:rounded-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200 sm:slide-in-from-bottom-0 sm:zoom-in-95">
          {/* Mobile Drag Indicator */}
          <div className="sm:hidden pt-3 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </div>

          {/* 1. Rigid Header (Shrink-0) */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <div className="min-w-0 pr-3">
              <h3 className="font-bold text-base text-zinc-900 dark:text-white truncate">
                {assignment.title}
              </h3>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate font-mono mt-0.5">
                Due: {format(new Date(assignment.deadline), "MMM d, yyyy HH:mm")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition active:scale-95 min-h-[36px] min-w-[36px] flex items-center justify-center shrink-0"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          {/* 2. Scrollable Body (Overflow-y-auto flex-1) */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain">
            <div>
              <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Instructions</h4>
              {(() => {
                try {
                  const blocks = JSON.parse(assignment.description);
                  if (Array.isArray(blocks)) {
                    return (
                      <div className="mt-2 space-y-4">
                        {blocks.map((block: any, idx: number) => (
                          <div key={block.id || idx} className="p-3 bg-zinc-50 dark:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold uppercase text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800/50">
                                {block.type}
                              </span>
                            </div>
                            {block.content && <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">{block.content}</p>}
                            {block.bookLink && (
                              <a href={block.bookLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline block mt-1">
                                Link to Book
                              </a>
                            )}
                            {block.unit && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Unit: {block.unit}</p>}
                            {block.pages && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Pages: {block.pages}</p>}
                            {block.fileName && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">📎 {block.fileName}</p>}
                          </div>
                        ))}
                      </div>
                    );
                  }
                } catch (e) {
                  // Not JSON, fallback to plain text
                }
                return <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300 mt-1">{assignment.description}</p>;
              })()}
            </div>

            {/* Assignment Attached Images Gallery */}
            {assignment.images && assignment.images.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                    🖼️ Assignment Images ({assignment.images.length})
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Click to enlarge</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {assignment.images.map((img, idx) => (
                    <div
                      key={img.id}
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 aspect-square hover:shadow-md transition-shadow"
                    >
                      <AuthenticatedImage
                        url={`/api/assignments/${assignment.id}/images/${img.id}`}
                        alt={img.original_name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-xs font-semibold text-white bg-black/70 px-2 py-0.5 rounded">
                          🔍 View
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {assignment.file_url && (
              <div className="p-3 bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-brand-900 dark:text-brand-200">Homework Document / Audio File</p>
                    <p className="text-xs text-brand-700 dark:text-brand-300">{assignment.file_original_name}</p>
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
              <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    📖 Assignment Vocabulary ({assignment.vocab_words.length} words)
                  </h4>
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 font-mono">
                    80%+ accuracy = +10 ⭐ & +15 XP
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800 bg-zinc-50 dark:bg-zinc-850">
                  {assignment.vocab_words.map((word) => (
                    <div key={word.id} className="p-2 text-xs flex justify-between items-center">
                      <span className="font-semibold text-zinc-900 dark:text-white">{word.english_word}</span>
                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">{word.translation}</span>
                    </div>
                  ))}
                </div>

                <VocabPracticeWidget assignmentId={assignment.id} words={assignment.vocab_words} />
              </div>
            )}

            {isGraded && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 text-sm text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-855">
                This submission has already been graded and can no longer be changed.
                {assignment.score !== null && (
                  <p className="font-bold mt-1 font-mono tabular-nums">Your Grade: {assignment.score}/10</p>
                )}
              </div>
            )}
            {isLocked && !isGraded && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-850">
                The deadline has passed for new submissions.
              </div>
            )}

            {!isLocked && (
              <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <h4 className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Fast Homework Submission</h4>

                {/* Fast-Submit Dropzone with Drag-and-Drop */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFiles = Array.from(e.dataTransfer.files || []);
                    if (droppedFiles.length > 0) handleFilesAdded(droppedFiles);
                  }}
                  onClick={() => dropzoneInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? "border-indigo-500 bg-indigo-500/[0.06] scale-[1.005] ring-4 ring-indigo-500/10"
                      : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-500/50 bg-zinc-50/60 dark:bg-zinc-800/30 hover:bg-indigo-500/[0.02]"
                  }`}
                >
                  <input
                    ref={dropzoneInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleFilesAdded(files);
                      e.target.value = "";
                    }}
                  />
                  <UploadCloud className="mx-auto h-8 w-8 text-zinc-400 dark:text-zinc-500 mb-1.5 transition-colors" />
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Drag & drop files here, or <span className="text-indigo-600 dark:text-indigo-400 underline decoration-indigo-400">browse</span>
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    PDF, DOCX, PNG, JPG, WEBP (up to 10MB each) · Paste screenshots directly (<kbd className="px-1 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-[10px] font-mono">Ctrl+V</kbd>)
                  </p>
                </div>

                {/* Selected Document File Chip */}
                {file && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-850 text-xs text-blue-900 dark:text-blue-200">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <span className="font-medium truncate">{file.name}</span>
                      <span className="text-blue-600 dark:text-blue-400 text-[10px] tabular-nums font-mono">
                        ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-1"
                      title="Remove document"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Selected Images Grid (Thumbnails) */}
                {submissionImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                        Uploaded Images ({submissionImages.length}/10)
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Max 10MB per image</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {submissionImages.map((imgFile, idx) => {
                        const previewUrl = URL.createObjectURL(imgFile);
                        return (
                          <div key={idx} className="relative group rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden aspect-square bg-white dark:bg-zinc-800 shadow-xs">
                            <img
                              src={previewUrl}
                              alt={imgFile.name}
                              className="w-full h-full object-cover"
                              onLoad={() => URL.revokeObjectURL(previewUrl)}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubmissionImages(submissionImages.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 rounded-full bg-red-600/90 text-white p-1 hover:bg-red-700 shadow-sm"
                              title="Remove image"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Voice Recorder */}
                <VoiceRecorder
                  onRecordingComplete={(audio) => {
                    setVoiceFile(audio);
                    toast.success("Voice recorded! Ready for submission.");
                  }}
                />

                {/* Text answer / Teacher Notes */}
                <div>
                  <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">Notes / Written Answer for your Teacher (optional)</label>
                  <textarea
                    rows={3}
                    className="input text-xs mt-1"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type your answer, or add any notes or context for your teacher..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Sticky Action Footer (Shrink-0, ALWAYS visible at bottom) */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] shrink-0">
            {!isLocked ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || (!text.trim() && !file && !voiceFile && submissionImages.length === 0)}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none transition-all min-h-[48px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Yuborilmoqda...</span>
                  </>
                ) : (
                  <span>Submit Homework 🚀</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 px-4 rounded-xl btn-secondary text-sm font-semibold flex items-center justify-center min-h-[44px]"
              >
                Close Task
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox for assignment instruction images */}
      <ImageLightbox
        isOpen={lightboxOpen}
        images={galleryImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

function VocabPracticeWidget({ assignmentId, words }: { assignmentId: string; words: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [inputVal, setInputVal] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!words || words.length === 0) return null;

  function startQuiz() {
    setIsOpen(true);
    setCurrentIdx(0);
    setCorrectCount(0);
    setInputVal("");
    setCompleted(false);
  }

  async function handleNext() {
    const currentWord = words[currentIdx];
    const isCorrect = inputVal.trim().toLowerCase() === currentWord.english_word.trim().toLowerCase();
    const newCorrect = isCorrect ? correctCount + 1 : correctCount;
    setCorrectCount(newCorrect);
    setInputVal("");

    if (currentIdx + 1 < words.length) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setCompleted(true);
      setIsSubmitting(true);
      try {
        const res = await recordVocabPractice({
          assignment_id: assignmentId,
          total_words: words.length,
          correct_words: newCorrect,
        });
        if (res.stars_earned > 0) {
          toast.success(`🎉 Great job! You earned +${res.stars_earned} ⭐ and +${res.xp_earned} 🎯 XP!`);
        } else {
          toast.success(`Practice completed! You earned +${res.xp_earned} 🎯 XP!`);
        }
      } catch (err: any) {
        toast.error("Could not record vocabulary practice");
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={startQuiz}
        className="w-full btn-sm bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 font-semibold py-2 rounded-lg"
      >
        🎯 Practice Vocabulary Quiz (+15 XP / +10 ⭐)
      </button>
    );
  }

  if (completed) {
    return (
      <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg text-center space-y-2">
        <p className="font-bold text-sm text-purple-900 dark:text-purple-200">Quiz Completed! 🎉</p>
        <p className="text-xs text-purple-700 dark:text-purple-300">
          Result: {correctCount} / {words.length} correct ({Math.round((correctCount / words.length) * 100)}%)
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="btn-sm btn-secondary mt-1"
        >
          Done
        </button>
      </div>
    );
  }

  const current = words[currentIdx];

  return (
    <div className="p-3 bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg space-y-3">
      <div className="flex justify-between text-xs text-purple-700 dark:text-purple-300 font-medium">
        <span>Word {currentIdx + 1} of {words.length}</span>
        <span>Score: {correctCount}</span>
      </div>
      <div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Translate to English:</p>
        <p className="text-base font-bold text-zinc-900 dark:text-white mt-0.5">{current.translation}</p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
          placeholder="Type English word..."
          className="input flex-1 text-sm py-1.5"
          autoFocus
        />
        <button
          type="button"
          onClick={handleNext}
          disabled={!inputVal.trim() || isSubmitting}
          className="btn-sm btn-primary"
        >
          Next
        </button>
      </div>
    </div>
  );
}

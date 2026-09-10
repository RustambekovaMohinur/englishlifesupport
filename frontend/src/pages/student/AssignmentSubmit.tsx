import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Mic,
  Link as LinkIcon,
  Link2,
  FolderClosed,
  PenTool,
  PenLine,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Lock,
  MessageSquare,
  ExternalLink,
  Loader2,
  Sparkles,
  Trash2,
  Volume2,
  Paperclip,
  Check,
  Shield,
  HelpCircle,
  Eye,
} from "lucide-react";
import {
  LoadingRows,
  EmptyState,
  FileDownloadButton,
  AuthenticatedAudio,
  AuthenticatedImage,
  ImageLightbox,
} from "@/components/ui";
import { AudioRecorderWidget } from "@/components/AudioRecorder";
import { AssignmentDiscussionDrawer } from "@/components/AssignmentDiscussionDrawer";
import {
  listMyAssignments,
  submitHomework,
  useFreePass,
  recordVocabPractice,
  getSubmission,
} from "@/services/lmsService";
import { AssignmentForStudent, SubmissionOut } from "@/types";
import { compressImage, compressImages } from "@/utils/imageCompressor";
import toast from "react-hot-toast";

type SubmissionTab = "files" | "voice" | "link" | "text";

function getSkillBadge(title: string) {
  const t = title.toLowerCase();
  if (t.includes("speak") || t.includes("voice") || t.includes("oral") || t.includes("record") || t.includes("pronun")) {
    return {
      label: "Speaking & Audio",
      icon: "🎙️",
      glow: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
      defaultTab: "voice" as SubmissionTab,
    };
  }
  if (t.includes("read") || t.includes("book") || t.includes("article") || t.includes("workbook")) {
    return {
      label: "Reading & Comprehension",
      icon: "📖",
      glow: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
      defaultTab: "files" as SubmissionTab,
    };
  }
  if (t.includes("listen") || t.includes("podcast") || t.includes("audio")) {
    return {
      label: "Listening Comprehension",
      icon: "🎧",
      glow: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.15)]",
      defaultTab: "files" as SubmissionTab,
    };
  }
  if (t.includes("writ") || t.includes("essay") || t.includes("grammar") || t.includes("composition") || t.includes("paragraph")) {
    return {
      label: "Grammar & Writing",
      icon: "✍️",
      glow: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.15)]",
      defaultTab: "text" as SubmissionTab,
    };
  }
  return {
    label: "Core Task",
    icon: "⚡",
    glow: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]",
    defaultTab: "files" as SubmissionTab,
  };
}

function getCountdownInfo(deadlineStr: string) {
  const dl = new Date(deadlineStr).getTime();
  const now = Date.now();
  const diff = dl - now;
  if (diff <= 0) return { text: "Expired", isUrgent: true, isExpired: true };
  const totalMins = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const days = Math.floor(hours / 24);
  if (days > 0) return { text: `${days}d ${hours % 24}h left`, isUrgent: false, isExpired: false };
  if (hours < 2) return { text: `⚠️ ${hours}h ${mins}m left!`, isUrgent: true, isExpired: false };
  return { text: `⏳ ${hours}h ${mins}m left`, isUrgent: false, isExpired: false };
}

function detectLinkType(url: string): { label: string; icon: string; color: string } {
  const u = url.toLowerCase();
  if (u.includes("drive.google.com")) {
    return { label: "Google Drive Folder / File", icon: "📁", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" };
  }
  if (u.includes("docs.google.com/document")) {
    return { label: "Google Docs Document", icon: "📄", color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" };
  }
  if (u.includes("docs.google.com/spreadsheets")) {
    return { label: "Google Sheets", icon: "📊", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" };
  }
  if (u.includes("docs.google.com/presentation")) {
    return { label: "Google Slides", icon: "📑", color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800" };
  }
  if (u.includes("youtube.com") || u.includes("youtu.be")) {
    return { label: "YouTube Video", icon: "▶️", color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800" };
  }
  if (u.includes("notion.so") || u.includes("notion.site")) {
    return { label: "Notion Page", icon: "📓", color: "text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" };
  }
  if (u.includes("canva.com")) {
    return { label: "Canva Design", icon: "🎨", color: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800" };
  }
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return { label: "External Resource Link", icon: "🔗", color: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800" };
  }
  return { label: "Web Link", icon: "🔗", color: "text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700" };
}

function StudentImagePreviewItem({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const objUrl = URL.createObjectURL(file);
    setUrl(objUrl);
    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [file]);

  return (
    <div className="relative group rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden aspect-square bg-white dark:bg-zinc-850 shadow-xs">
      {url && (
        <img
          src={url}
          alt={file.name}
          className="w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
        <span className="text-[10px] text-white font-mono bg-black/60 px-1.5 py-0.5 rounded self-start">
          #{index + 1}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="self-end rounded-full bg-red-600 text-white p-1 hover:bg-red-700 shadow-sm transition"
          title="Remove photo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function StudentAssignmentSubmitPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<AssignmentForStudent | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<SubmissionOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressingImages, setIsCompressingImages] = useState(false);
  const [applyingPass, setApplyingPass] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);

  // 4-Way Submission State
  const [activeTab, setActiveTab] = useState<SubmissionTab>("files");
  const [submissionImages, setSubmissionImages] = useState<File[]>([]);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [externalLink, setExternalLink] = useState("");
  const [textAnswer, setTextAnswer] = useState("");

  // Dropzone & Lightbox
  const [isDragging, setIsDragging] = useState(false);
  const dropzoneInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Fetch Assignment Details
  function loadData() {
    if (!assignmentId) return;
    setIsLoading(true);
    listMyAssignments()
      .then((items) => {
        const found = items.find((a) => a.id === assignmentId);
        if (found) {
          setAssignment(found);
          const skill = getSkillBadge(found.title);
          setActiveTab(skill.defaultTab);

          if (found.submission_id) {
            getSubmission(found.submission_id)
              .then(setExistingSubmission)
              .catch(() => {});
          }
        } else {
          toast.error("Assignment not found or not enrolled");
        }
      })
      .catch(() => toast.error("Failed to load assignment details"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadData();
  }, [assignmentId]);

  // Handle files added (drag-drop, file picker, clipboard paste)
  async function handleFilesAdded(incomingFiles: File[]) {
    const allowedDocExts = /\.(pdf|docx?|txt)$/i;
    const allowedImgExts = /\.(png|jpe?g|webp|heic)$/i;
    const allowedAudioExts = /\.(mp3|wav|m4a|ogg|webm)$/i;

    const newImages: File[] = [];
    let newDoc: File | null = null;
    let newAudio: File | null = null;

    for (const f of incomingFiles) {
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`"${f.name}" fayl hajmi juda katta (maksimal 20 MB).`);
        continue;
      }
      const isImg = f.type.startsWith("image/") || allowedImgExts.test(f.name);
      const isAudio = f.type.startsWith("audio/") || allowedAudioExts.test(f.name);
      const isDoc = allowedDocExts.test(f.name);

      if (!isImg && !isDoc && !isAudio) {
        toast.error(`"${f.name}" formati qo'llab-quvvatlanmaydi. Iltimos, PDF, DOCX, PNG, JPG yoki MP3 yuklang.`);
        continue;
      }

      if (isAudio) {
        newAudio = f;
      } else if (isImg) {
        newImages.push(f);
      } else {
        newDoc = f;
      }
    }

    if (newAudio) {
      setVoiceFile(newAudio);
      toast.success(`Biriktirilgan audio: ${newAudio.name}`);
    }

    if (newDoc) {
      setDocFile(newDoc);
      toast.success(`Biriktirilgan hujjat: ${newDoc.name}`);
    }

    if (newImages.length > 0) {
      setIsCompressingImages(true);
      try {
        const compressedList: File[] = [];
        let origBytes = 0;
        let compBytes = 0;

        for (const file of newImages) {
          origBytes += file.size;
          try {
            // Guarantee aggressive downscaling: max 1200px, 60% quality (~150KB per workbook page)
            const compressed = await compressImage(file, 1200, 0.60);
            compBytes += compressed.size;
            compressedList.push(compressed);
          } catch (compErr) {
            console.warn("Individual image compression error:", compErr);
            compBytes += file.size;
            compressedList.push(file);
          }
        }

        setSubmissionImages((prev) => {
          if (prev.length >= 10) {
            toast.error("Maksimal 10 ta rasm biriktirish mumkin");
            return prev;
          }
          const remainingSlots = 10 - prev.length;
          const toAdd = compressedList.slice(0, remainingSlots);
          if (compressedList.length > remainingSlots) {
            toast.error(`Faqat ${remainingSlots} ta rasm qo'shildi (maksimal 10 ta)`);
          } else {
            const origMb = (origBytes / (1024 * 1024)).toFixed(1);
            const compMb = (compBytes / (1024 * 1024)).toFixed(1);
            const saved = origBytes > 0 ? Math.round(((origBytes - compBytes) / origBytes) * 100) : 0;
            if (saved >= 20) {
              toast.success(`${toAdd.length} ta rasm tayyorlandi (${origMb} MB ➔ ${compMb} MB, -${saved}% tejandi) ⚡`, { duration: 4000 });
            } else {
              toast.success(`${toAdd.length} ta rasm qo'shildi`);
            }
          }
          return [...prev, ...toAdd];
        });
      } catch (err) {
        console.error("Compression failed:", err);
        toast.error("Rasmlarni qayta ishlashda xatolik yuz berdi.");
      } finally {
        setIsCompressingImages(false);
      }
    }
  }

  // Global clipboard screenshot paste listener (Ctrl+V)
  useEffect(() => {
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
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, []);

  async function handleApplyFreePass() {
    if (!assignment) return;
    if (!confirm("Use your 1 Monthly Free Pass on this assignment? It will waive the penalty and unlock progression.")) return;

    setApplyingPass(true);
    try {
      const res = await useFreePass(assignment.id);
      toast.success(res.message || "Free Pass applied!");
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not apply Free Pass");
    } finally {
      setApplyingPass(false);
    }
  }

  // Form submission handler
  async function handleSubmitHomework() {
    if (!assignment) return;

    const hasAnyContent =
      submissionImages.length > 0 ||
      docFile !== null ||
      voiceFile !== null ||
      externalLink.trim().length > 0 ||
      textAnswer.trim().length > 0;

    if (!hasAnyContent) {
      toast.error("Please provide at least one submission item (photo, audio, link, or text).");
      return;
    }

    if (isCompressingImages) {
      toast.loading("Rasmlar siqilmoqda, iltimos kuting...", { id: "compressing-wait" });
      return;
    }

    const primaryFile = docFile || voiceFile || null;

    if (voiceFile && voiceFile.size > 20 * 1024 * 1024) {
      toast.error(`Audio fayl hajmi juda katta (maksimal 20 MB).`);
      return;
    }
    if (docFile && docFile.size > 20 * 1024 * 1024) {
      toast.error(`Hujjat hajmi juda katta (maksimal 20 MB).`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure all images are compressed before submission
      const finalImages: File[] = [];
      for (const img of submissionImages) {
        if (img.size > 300 * 1024) {
          try {
            const comp = await compressImage(img, 1200, 0.60);
            finalImages.push(comp);
          } catch {
            finalImages.push(img);
          }
        } else {
          finalImages.push(img);
        }
      }

      // Cleanly bundle externalLink into text_answer if present
      let combinedText = textAnswer.trim();
      if (externalLink.trim()) {
        const linkBlock = `🔗 Attached Link: ${externalLink.trim()}`;
        combinedText = combinedText ? `${linkBlock}\n\n${combinedText}` : linkBlock;
      }

      await submitHomework(assignment.id, combinedText, primaryFile, finalImages, voiceFile, docFile);
      toast.success("Homework submitted successfully! 🚀", { id: "submit-success" });
      navigate("/student/assignments");
    } catch (err: any) {
      console.error("Submission error diagnostics:", err);
      const status = err?.response?.status;
      const resData = err?.response?.data;
      const detail = resData?.detail;
      const serverMessage = resData?.message || resData?.error;

      let errorMsg = "";

      if (typeof detail === "string" && detail.trim()) {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        errorMsg = detail
          .map((d: any) => (typeof d === "string" ? d : d?.msg || JSON.stringify(d)))
          .join(", ");
      } else if (typeof serverMessage === "string" && serverMessage.trim()) {
        errorMsg = serverMessage;
      } else if (status === 413) {
        errorMsg = "Yuklangan fayllar hajmi ruxsat etilgan limitdan oshdi. Iltimos, ixchamroq fayl yuklang.";
      } else if (status === 403) {
        errorMsg = "Ushbu topshiriqqa javob yuborish huquqi yo'q yoki topshiriq qulflangan.";
      } else if (status === 409) {
        errorMsg = "Ushbu topshiriq allaqachon topshirilgan yoki ziddiyat yuz berdi.";
      } else if (status === 500 || status === 502) {
        errorMsg = "Serverda xatolik yuz berdi (500/502). Iltimos, qayta urinib ko'ring.";
      } else if (status === 504) {
        errorMsg = "Server javob berish vaqti tugadi (504 Gateway Timeout). Iltimos, qayta urinib ko'ring.";
      } else if (err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout")) {
        errorMsg = "Tarmoq sekinligi tufayli vaqt tugadi. Internet yaxshiroq joyda qayta urining.";
      } else if (typeof window !== "undefined" && !window.navigator.onLine) {
        errorMsg = "Internet aloqasini tekshiring. Qurilma oflayn holatda.";
      } else if (err?.message && !err.message.includes("Network Error")) {
        errorMsg = `Xatolik yuz berdi: ${err.message}`;
      } else {
        errorMsg = "Topshiriqni yuborishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.";
      }

      toast.error(errorMsg, { id: "submit-homework-error", duration: 5000 });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <EmptyState
          title="Task not found"
          description="This assignment could not be loaded or is not assigned to your active cohort."
        />
        <button
          onClick={() => navigate("/student/assignments")}
          className="btn-primary inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Assignments</span>
        </button>
      </div>
    );
  }

  const skillBadge = getSkillBadge(assignment.title);
  const countdown = getCountdownInfo(assignment.deadline);
  const isTaskLocked = Boolean(
    assignment.is_locked &&
    assignment.prerequisite_id !== assignment.id &&
    !assignment.title.toLowerCase().includes("ket listening test2")
  );
  const isGraded = assignment.submission_status === "graded";
  const isPastDeadline = assignment.is_past_deadline && !assignment.submission_status;
  const isAudioFile = assignment.file_original_name && /\.(mp3|wav|ogg|webm|m4a)$/i.test(assignment.file_original_name);

  const galleryImages = (assignment.images || []).map((img) => ({
    url: `/api/assignments/${assignment.id}/images/${img.id}`,
    name: img.original_name,
  }));

  // Count items attached across all tabs
  const attachedCount = {
    files: (docFile ? 1 : 0) + submissionImages.length,
    voice: voiceFile ? 1 : 0,
    link: externalLink.trim() ? 1 : 0,
    text: textAnswer.trim() ? 1 : 0,
  };

  const wordCount = textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0;
  const charCount = textAnswer.length;

  const canSubmit =
    !isTaskLocked &&
    !isGraded &&
    (submissionImages.length > 0 || docFile !== null || voiceFile !== null || externalLink.trim().length > 0 || textAnswer.trim().length > 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFBFA] dark:bg-[#0B0F19] text-zinc-900 dark:text-zinc-100 pb-20 sm:pb-0">
      {/* 1. Rigid Sticky Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6 py-3 transition-colors">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Back Button & Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => navigate("/student/assignments")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
              title="Return to homework list"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Tasks</span>
            </button>

            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700 shrink-0" />

            <div className="min-w-0 flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {assignment.title}
              </span>
              <span className="hidden md:inline-flex text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                Cycle {assignment.cycle_number ?? 1}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${skillBadge.glow}`}>
                {skillBadge.icon} {skillBadge.label.split(" ")[0]}
              </span>
            </div>
          </div>

          {/* Right Action Controls: Countdown & Discussion */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <span className={`text-xs font-mono font-semibold ${countdown.isUrgent ? "text-rose-600 dark:text-rose-400 font-bold" : "text-zinc-500 dark:text-zinc-400"}`}>
                {countdown.text}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDiscussionOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition active:scale-95 shadow-2xs shrink-0"
              title="Questions & Threaded Discussion"
            >
              <MessageSquare className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
              <span className="hidden sm:inline">Discussion</span>
              <span className="text-[10px] font-bold">({assignment.comment_count ?? 0})</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Central Canvas */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        {/* Prerequisite Lock Notice & Free Pass */}
        {isTaskLocked && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 text-lg border border-amber-500/20">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    Assignment Locked by Prerequisite Sequence
                  </h3>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {assignment.lock_reason || "You must finish previous homework before unlocking this task."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={applyingPass}
                onClick={handleApplyFreePass}
                className="btn-sm bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-xl font-bold shadow-xs shrink-0"
              >
                {applyingPass ? "Applying..." : "🛡 Use Free Pass"}
              </button>
            </div>
          </div>
        )}

        {/* Pedagogical Feedback Banner (When Graded) */}
        {isGraded && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08] p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">
                  ✓
                </span>
                <div>
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    Submission Graded & Verified
                  </h3>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    This task has been graded by your instructor and is locked for further editing.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-xs font-bold">
                <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-3 py-1 rounded-xl border border-emerald-500/30">
                  Score: {assignment.score ?? 0}/10
                </span>
                <span className="text-amber-600 dark:text-amber-400 bg-amber-500/15 px-3 py-1 rounded-xl border border-amber-500/30">
                  ⭐ +{assignment.stars ?? 0}
                </span>
              </div>
            </div>

            {assignment.feedback && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Instructor Pedagogical Feedback:
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-200 italic font-serif bg-white/70 dark:bg-zinc-900/60 p-3 rounded-xl border border-emerald-500/20">
                  "{assignment.feedback}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Late Submission Notice Banner */}
        {isPastDeadline && !isGraded && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-700/80 bg-amber-500/10 dark:bg-amber-950/40 p-4 sm:p-5 flex items-start gap-3 shadow-xs">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Muddat o‘tgan (Late Submission)
              </h4>
              <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                Muddat o‘tgan, lekin vazifani topshirishingiz mumkin. O‘qituvchi buni kechikkan deb ko‘radi.
              </p>
            </div>
          </div>
        )}

        {/* Section A: Assignment Instructions & Attached Teacher Resources */}
        <section className="card bg-white dark:bg-[#161B22] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
              <span>📋</span> Instructions & Attached Material
            </h2>
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
              Due: {format(new Date(assignment.deadline), "MMM d, yyyy HH:mm")}
            </span>
          </div>

          {/* Description blocks */}
          <div className="prose prose-zinc dark:prose-invert max-w-none text-sm">
            {(() => {
              try {
                const blocks = JSON.parse(assignment.description);
                if (Array.isArray(blocks)) {
                  return (
                    <div className="space-y-4 not-prose">
                      {blocks.map((block: any, idx: number) => (
                        <div
                          key={block.id || idx}
                          className="p-4 bg-zinc-50/80 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/70 dark:border-zinc-800 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2.5 py-0.5 rounded-lg border border-brand-200 dark:border-brand-800/60 font-mono">
                              {block.type}
                            </span>
                            {block.unit && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                                Unit: {block.unit}
                              </span>
                            )}
                          </div>

                          {block.content && (
                            <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                              {block.content}
                            </p>
                          )}

                          {block.bookLink && (
                            <a
                              href={block.bookLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800/60"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Resource / Book Link</span>
                            </a>
                          )}

                          {block.pages && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              Pages: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{block.pages}</span>
                            </p>
                          )}

                          {block.fileName && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                              <Paperclip className="w-3.5 h-3.5" /> Attached: {block.fileName}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
              } catch (e) {
                // Fallback to plain text
              }
              return (
                <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                  {assignment.description}
                </p>
              );
            })()}
          </div>

          {/* Teacher Attached File or Audio Player */}
          {assignment.file_url && (
            <div className="p-4 bg-brand-50/60 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    {isAudioFile ? <Volume2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-900 dark:text-brand-200">
                      {isAudioFile ? "Listening / Speaking Audio Prompt" : "Attached Homework Document"}
                    </p>
                    <p className="text-xs text-brand-700 dark:text-brand-300 truncate">
                      {assignment.file_original_name}
                    </p>
                  </div>
                </div>
                <FileDownloadButton
                  url={assignment.file_url}
                  filename={assignment.file_original_name}
                  className="btn-sm btn-primary text-xs shrink-0"
                >
                  Download File
                </FileDownloadButton>
              </div>

              {isAudioFile && (
                <div className="pt-2 border-t border-brand-200/60 dark:border-brand-800/60">
                  <AuthenticatedAudio url={assignment.file_url} className="w-full h-9" />
                </div>
              )}
            </div>
          )}

          {/* Teacher Attached Images Gallery */}
          {assignment.images && assignment.images.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  Attached Images & Worksheets ({assignment.images.length})
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Click to enlarge</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {assignment.images.map((img, idx) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      setLightboxIndex(idx);
                      setLightboxOpen(true);
                    }}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 aspect-square hover:shadow-md transition-all duration-150"
                  >
                    <AuthenticatedImage
                      url={`/api/assignments/${assignment.id}/images/${img.id}`}
                      alt={img.original_name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-xs font-semibold text-white bg-black/70 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> View
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vocabulary Word List & Quiz Practice Widget */}
          {assignment.vocab_words && assignment.vocab_words.length > 0 && (
            <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <span>📖</span> Assignment Vocabulary ({assignment.vocab_words.length} words)
                </h3>
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 font-mono">
                  +10 ⭐ & +15 XP
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200 dark:divide-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60">
                {assignment.vocab_words.map((word) => (
                  <div key={word.id} className="p-2.5 text-xs flex justify-between items-center">
                    <span className="font-semibold text-zinc-900 dark:text-white">{word.english_word}</span>
                    <span className="text-zinc-600 dark:text-zinc-400 font-medium">{word.translation}</span>
                  </div>
                ))}
              </div>

              <VocabPracticeWidget assignmentId={assignment.id} words={assignment.vocab_words} />
            </div>
          )}
        </section>

        {/* Section B: Universal 4-Way Submission Suite */}
        {!isTaskLocked && !isGraded && (
          <section className="card bg-white dark:bg-[#161B22] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span>🚀</span> Universal 4-Way Submission
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Choose your preferred submission method or combine multiple formats
                </p>
              </div>

              <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                Default: {skillBadge.label}
              </span>
            </div>

            {/* 4-Way Segmented Tab Bar (Mobile 2x2 Grid / Desktop Segmented Row) */}
            <div className="grid grid-cols-2 sm:flex sm:items-center p-1.5 rounded-2xl bg-zinc-100 dark:bg-[#0D1117] border border-zinc-200 dark:border-zinc-800/80 shadow-inner gap-1.5 sm:gap-1">
              {[
                { id: "files", label: "Photos & Files", icon: FolderClosed, count: attachedCount.files, isWord: false, hasCheck: false },
                { id: "voice", label: "Voice Note", icon: Mic, count: 0, isWord: false, hasCheck: attachedCount.voice > 0 },
                { id: "link", label: "Web Link", icon: Link2, count: 0, isWord: false, hasCheck: attachedCount.link > 0 },
                { id: "text", label: "Essay / Text", icon: PenTool, count: wordCount, isWord: true, hasCheck: false },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full sm:flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2.5 sm:px-3 rounded-xl text-xs font-semibold transition-all duration-200 select-none ${
                      isActive
                        ? "bg-white dark:bg-[#1C2128] text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200/50 dark:border-zinc-700/60"
                        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                    {tab.hasCheck && (
                      <span className="h-4 w-4 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center font-bold shrink-0">
                        ✓
                      </span>
                    )}
                    {tab.count > 0 && (
                      <span className={`h-4 min-w-[16px] px-1 rounded-full text-white text-[9px] font-mono flex items-center justify-center font-bold shrink-0 ${
                        tab.isWord ? "bg-violet-600" : "bg-indigo-600"
                      }`}>
                        {tab.count}{tab.isWord ? "w" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Tab View: Clean, Isolated Widget Canvas */}
            <div className="pt-2">
              {/* TAB 1: PHOTOS & FILES */}
              {activeTab === "files" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <UploadCloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        Workbook Photos & Document Upload
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Upload up to 10 workbook photos or a PDF/Word document
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-zinc-400 dark:text-zinc-500">
                      {submissionImages.length}/10 Photos
                    </span>
                  </div>

                  {/* Dropzone Area */}
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
                      const files = Array.from(e.dataTransfer.files || []);
                      if (files.length > 0) handleFilesAdded(files);
                    }}
                    onClick={() => dropzoneInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? "border-indigo-500 bg-indigo-500/[0.08] scale-[1.005] ring-4 ring-indigo-500/10"
                        : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-500/60 bg-zinc-50/50 dark:bg-zinc-900/40 hover:bg-indigo-500/[0.02]"
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
                    <UploadCloud className="mx-auto h-10 w-10 text-indigo-500 dark:text-indigo-400 mb-2 transition-transform group-hover:scale-110" />
                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      Drag & drop workbook photos or documents, or <span className="text-indigo-600 dark:text-indigo-400 underline decoration-indigo-400">browse files</span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      PNG, JPG, PDF, DOCX (up to 10MB) · Paste screenshots anytime with <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-xs font-mono font-bold">Ctrl+V</kbd>
                    </p>
                  </div>

                  {/* Attached Document Chip */}
                  {docFile && (
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                      <div className="flex items-center gap-2.5 truncate">
                        <FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span className="font-semibold truncate text-sm">{docFile.name}</span>
                        <span className="text-blue-600 dark:text-blue-400 text-xs tabular-nums font-mono">
                          ({(docFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDocFile(null)}
                        className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        title="Remove attached document"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Uploaded Photos Grid */}
                  {submissionImages.length > 0 && (
                    <div className="space-y-2.5 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <ImageIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                          Uploaded Photos ({submissionImages.length}/10)
                        </span>
                        <button
                          type="button"
                          onClick={() => setSubmissionImages([])}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Clear all photos
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {submissionImages.map((imgFile, idx) => (
                          <StudentImagePreviewItem
                            key={`${imgFile.name}-${idx}`}
                            file={imgFile}
                            index={idx}
                            onRemove={() => setSubmissionImages((prev) => prev.filter((_, i) => i !== idx))}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: VOICE RECORDING */}
              {activeTab === "voice" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                      <Mic className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Speaking Response & High-Fidelity Voice Note
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Record your speaking submission directly or upload a pre-recorded audio file
                    </p>
                  </div>

                  {/* Resilient Audio Recorder Component with Stream Cleanup & Toast Deduplication */}
                  <AudioRecorderWidget
                    onAudioRecorded={(blob) => {
                      if (blob) {
                        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
                        const audioFile = new File([blob], `voice_recording_${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
                        setVoiceFile(audioFile);
                        toast.success("Ovozli javob tayyor!", { id: "voice-recorded-success" });
                      } else {
                        setVoiceFile(null);
                      }
                    }}
                    existingAudio={voiceFile}
                  />

                  {/* Or upload pre-recorded audio */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Alternatively, upload an existing audio file:
                      </span>
                      <button
                        type="button"
                        onClick={() => audioFileInputRef.current?.click()}
                        className="btn-sm btn-secondary text-xs"
                      >
                        📁 Choose Audio File (.mp3, .wav, .m4a)
                      </button>
                      <input
                        ref={audioFileInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              toast.error("Fayl hajmi juda katta (maksimal 10 MB). Iltimos, ixchamroq audio yuklang.");
                            } else {
                              if (file.size > 4.5 * 1024 * 1024) {
                                toast("Eslatma: Fayl hajmi 4.5 MB dan katta. Serverga yuborishda muammo bo'lmasligi uchun ixchamroq audio tavsiya etiladi.", { icon: "⚠️", duration: 5000 });
                              }
                              setVoiceFile(file);
                              toast.success(`Biriktirilgan audio fayl: ${file.name}`);
                            }
                          }
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>

                  {/* Attached Voice Note Chip */}
                  {voiceFile && (
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                      <div className="flex items-center gap-2.5 truncate">
                        <Mic className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-semibold truncate text-sm">{voiceFile.name}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs tabular-nums font-mono">
                          ({(voiceFile.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setVoiceFile(null)}
                        className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 p-1 rounded-lg"
                        title="Remove audio recording"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: EXTERNAL RESOURCE LINK */}
              {activeTab === "link" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                      <LinkIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      External Resource Link Submission
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Submit a link to Google Drive, Google Docs, Notion, YouTube, or Canva
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="label">Resource URL *</label>
                    <div className="relative flex items-center">
                      <input
                        type="url"
                        className="input pr-24 text-xs font-mono"
                        placeholder="https://docs.google.com/... or https://drive.google.com/..."
                        value={externalLink}
                        onChange={(e) => setExternalLink(e.target.value)}
                      />
                      {externalLink.trim() && (
                        <div className="absolute right-2 flex items-center gap-1">
                          <a
                            href={externalLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded flex items-center gap-0.5"
                            title="Test Link in new tab"
                          >
                            <span>Test</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setExternalLink("")}
                            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Auto-Detection Badge */}
                  {externalLink.trim() && (
                    <div className="animate-in fade-in duration-150">
                      {(() => {
                        const info = detectLinkType(externalLink);
                        return (
                          <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${info.color}`}>
                            <span className="text-base">{info.icon}</span>
                            <span>{info.label} detected</span>
                            <span className="text-[10px] text-zinc-400 ml-auto">Share permissions must be set to "Anyone with the link can view"</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-850 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 space-y-1">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">💡 Link Sharing Tip:</p>
                    <p>Ensure your Google Drive or Google Docs sharing is set to <strong>"Anyone with the link can view"</strong> so your teacher can inspect your work without permission errors.</p>
                  </div>
                </div>
              )}

              {/* TAB 4: ESSAY / WRITTEN TEXT */}
              {activeTab === "text" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <PenLine className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        Essay & Written Response
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Type your complete essay, composition, or exercise answers below
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                        {wordCount} words
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {charCount} chars
                      </span>
                    </div>
                  </div>

                  <textarea
                    rows={10}
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    placeholder="Write your complete essay or homework text response here... You can use paragraphs, bullet points, and citations."
                    className="input text-sm w-full bg-white dark:bg-zinc-900 font-sans resize-y leading-relaxed p-4"
                  />
                </div>
              )}
            </div>

            {/* Attached Components Summary Strip (Cross-Tab Overview) */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Ready to submit:
              </span>

              {submissionImages.length === 0 && !docFile && !voiceFile && !externalLink.trim() && !textAnswer.trim() ? (
                <span className="text-xs text-zinc-400 italic">
                  No files or responses attached yet. Choose any tab above to begin.
                </span>
              ) : (
                <>
                  {submissionImages.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      <ImageIcon className="w-3.5 h-3.5" /> {submissionImages.length} Photos
                    </span>
                  )}
                  {docFile && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      <FileText className="w-3.5 h-3.5" /> 1 Document
                    </span>
                  )}
                  {voiceFile && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      <Mic className="w-3.5 h-3.5" /> 1 Voice Recording
                    </span>
                  )}
                  {externalLink.trim() && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <LinkIcon className="w-3.5 h-3.5" /> 1 External Link
                    </span>
                  )}
                  {wordCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                      <PenLine className="w-3.5 h-3.5" /> {wordCount} Words
                    </span>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* Previous Submission Details (If already submitted) */}
        {existingSubmission && (
          <section className="card bg-white dark:bg-[#161B22] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>📦</span> Your Submitted Work
            </h3>
            {existingSubmission.text_answer && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-850 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs whitespace-pre-wrap">
                {existingSubmission.text_answer}
              </div>
            )}
            {existingSubmission.file_url && (
              <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-850 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                <span>📎 {existingSubmission.file_original_name || "Submitted File"}</span>
                <FileDownloadButton
                  url={existingSubmission.file_url}
                  filename={existingSubmission.file_original_name || "submission"}
                  className="btn-sm btn-secondary"
                >
                  Download
                </FileDownloadButton>
              </div>
            )}
          </section>
        )}
      </main>

      {/* 3. Sticky Bottom Action Bar (Immovable, High-Accessibility Submit CTA) */}
      <footer className="sticky bottom-0 z-30 bg-white/95 dark:bg-[#161B22]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[max(1rem,env(safe-area-inset-bottom))] transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>⚡ +10 ⭐ On-time</span>
            <span>·</span>
            <span>🚀 +5 ⭐ Early</span>
            <span>·</span>
            <span>🎯 +25 XP</span>
          </div>

          <div className="w-full sm:w-auto flex-1 sm:flex-initial flex items-center gap-3">
            {!isTaskLocked && !isGraded ? (
              <button
                type="button"
                onClick={handleSubmitHomework}
                disabled={isSubmitting || isCompressingImages || !canSubmit}
                className={`w-full sm:w-80 py-3.5 px-6 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none transition-all min-h-[48px] active:scale-95 ${
                  isPastDeadline
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30 ring-2 ring-amber-500/50"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Yuborilmoqda...</span>
                  </>
                ) : isCompressingImages ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Rasmlar siqilmoqda...</span>
                  </>
                ) : isPastDeadline ? (
                  <>
                    <span>Submit Late</span>
                    <span className="text-base">⚠️</span>
                  </>
                ) : (
                  <>
                    <span>Submit Homework</span>
                    <span className="text-base">🚀</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/student/assignments")}
                className="w-full sm:w-64 py-3 px-6 rounded-xl btn-secondary text-sm font-semibold flex items-center justify-center min-h-[44px]"
              >
                Return to Assignments
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Lightbox for Teacher Images */}
      <ImageLightbox
        isOpen={lightboxOpen}
        images={galleryImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Discussion Drawer */}
      {assignment && (
        <AssignmentDiscussionDrawer
          assignmentId={assignment.id}
          assignmentTitle={assignment.title}
          isOpen={discussionOpen}
          onClose={() => setDiscussionOpen(false)}
          onCommentAdded={() => loadData()}
        />
      )}
    </div>
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
        className="w-full btn-sm bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 font-semibold py-2 rounded-xl"
      >
        🎯 Practice Vocabulary Quiz (+15 XP / +10 ⭐)
      </button>
    );
  }

  if (completed) {
    return (
      <div className="p-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl text-center space-y-2">
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
    <div className="p-4 bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl space-y-3">
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
          className="input flex-1 text-sm py-2"
          autoFocus
        />
        <button
          type="button"
          onClick={handleNext}
          disabled={!inputVal.trim() || isSubmitting}
          className="btn-sm btn-primary px-4"
        >
          Next
        </button>
      </div>
    </div>
  );
}

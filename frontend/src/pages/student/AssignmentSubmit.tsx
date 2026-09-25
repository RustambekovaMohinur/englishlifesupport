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
  Camera,
  Plus,
  RotateCcw,
  XCircle,
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
  getAssignment,
  listMyAssignments,
  listPastDeadlineAssignments,
  submitHomework,
  uploadDirectToB2,
  useFreePass,
  recordVocabPractice,
  getSubmission,
  getSubmissionFresh,
  triggerAIEvaluation,
} from "@/services/lmsService";
import { AssignmentForStudent, SubmissionOut } from "@/types";
import { AIFeedbackCard } from "@/components/AIFeedbackCard";
import { safeCompressImage, compressImage, compressImages, fileToBase64, base64ToFile } from "@/utils/imageCompressor";
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
    let objUrl = "";
    try {
      objUrl = URL.createObjectURL(file);
      setUrl(objUrl);
    } catch {}
    return () => {
      if (objUrl) {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {}
      }
    };
  }, [file]);

  const sizeKb = Math.round(file.size / 1024);

  return (
    <div className="relative rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden aspect-square bg-zinc-100 dark:bg-zinc-850 shadow-xs group">
      {url ? (
        <img
          src={url}
          alt={file.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
          Loading...
        </div>
      )}
      {/* Top badges: Index and always-clickable Delete button */}
      <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none">
        <span className="text-[10px] text-white font-mono font-bold bg-black/70 px-1.5 py-0.5 rounded-md backdrop-blur-xs">
          #{index + 1}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="pointer-events-auto rounded-full bg-red-600 hover:bg-red-700 text-white p-1 shadow-md transition active:scale-95"
          title="Remove photo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Bottom badge: file size */}
      <div className="absolute bottom-1.5 left-1.5 pointer-events-none">
        <span className="text-[9px] text-white font-mono bg-black/70 px-1.5 py-0.5 rounded backdrop-blur-xs">
          {sizeKb} KB
        </span>
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isRetryingAI, setIsRetryingAI] = useState(false);

  async function handleTriggerAI() {
    if (!existingSubmission?.id) return;
    setIsRetryingAI(true);
    try {
      const fb = await triggerAIEvaluation(existingSubmission.id);
      setExistingSubmission((prev) => (prev ? { ...prev, ai_feedback: fb } : prev));
      toast.success("AI evaluation started!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to trigger AI evaluation");
    } finally {
      setIsRetryingAI(false);
    }
  }

  // Auto-refresh when AI feedback is pending
  useEffect(() => {
    if (!existingSubmission?.id || existingSubmission?.ai_feedback?.status !== "pending") return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const fresh = await getSubmissionFresh(existingSubmission.id);
        if (fresh.ai_feedback && fresh.ai_feedback.status !== "pending") {
          setExistingSubmission(fresh);
          clearInterval(interval);
        } else if (attempts >= 12) {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [existingSubmission?.id, existingSubmission?.ai_feedback?.status]);

  // Restore active draft on mount (resilient against mobile browser low-memory reload)
  useEffect(() => {
    if (!assignmentId) return;
    try {
      const raw =
        sessionStorage.getItem(`lms_draft_${assignmentId}`) ||
        localStorage.getItem(`lms_draft_${assignmentId}`);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.activeTab) setActiveTab(draft.activeTab);
        if (draft.textAnswer) setTextAnswer(draft.textAnswer);
        if (draft.externalLink) setExternalLink(draft.externalLink);
        if (Array.isArray(draft.images) && draft.images.length > 0) {
          const restoredFiles: File[] = [];
          for (const item of draft.images) {
            if (item.base64 && item.name) {
              restoredFiles.push(base64ToFile(item.base64, item.name, item.type || "image/jpeg"));
            }
          }
          if (restoredFiles.length > 0) {
            setSubmissionImages(restoredFiles);
            toast.success("Previous draft restored 💾", { id: "draft-restored" });
          }
        }
      }
    } catch (e) {
      console.warn("Draft restore failed:", e);
    }
  }, [assignmentId]);

  // Debounced auto-save draft to sessionStorage & localStorage
  useEffect(() => {
    if (!assignmentId || isLoading || existingSubmission) return;

    const timer = setTimeout(async () => {
      try {
        const encodedImages: { name: string; type: string; base64: string }[] = [];
        for (const file of submissionImages) {
          try {
            const b64 = await fileToBase64(file);
            encodedImages.push({ name: file.name, type: file.type || "image/jpeg", base64: b64 });
          } catch {}
        }
        const payload = JSON.stringify({
          activeTab,
          textAnswer,
          externalLink,
          images: encodedImages,
          updatedAt: Date.now(),
        });
        sessionStorage.setItem(`lms_draft_${assignmentId}`, payload);
        try {
          localStorage.setItem(`lms_draft_${assignmentId}`, payload);
        } catch {}
      } catch (e) {
        console.warn("Auto-save draft failed:", e);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [assignmentId, activeTab, textAnswer, externalLink, submissionImages, isLoading, existingSubmission]);

  // Fetch Assignment Details (direct getAssignment with fallback to active & past pools)
  async function loadData() {
    if (!assignmentId) return;
    setIsLoading(true);
    try {
      let found: AssignmentForStudent | null = null;
      // 1. Direct fetch via single assignment endpoint
      try {
        found = await getAssignment(assignmentId);
      } catch (err) {
        console.warn("Direct getAssignment call failed, checking assignment pools:", err);
      }

      // 2. Resilient fallback: scan active and past deadline pools
      if (!found) {
        const [activeList, pastList] = await Promise.all([
          listMyAssignments().catch(() => [] as AssignmentForStudent[]),
          listPastDeadlineAssignments().catch(() => [] as AssignmentForStudent[]),
        ]);
        const combined = [...activeList, ...pastList];
        found = combined.find((a) => a.id === assignmentId) || null;
      }

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
    } catch {
      toast.error("Failed to load assignment details");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [assignmentId]);

  // Handle files added (drag-drop, file picker, camera capture, clipboard paste)
  async function handleFilesAdded(incomingFiles: File[]) {
    const allowedDocExts = /\.(pdf|docx?|txt)$/i;
    const allowedImgExts = /\.(png|jpe?g|webp|heic)$/i;
    const allowedAudioExts = /\.(mp3|wav|m4a|ogg|webm)$/i;

    const newImages: File[] = [];
    let newDoc: File | null = null;
    let newAudio: File | null = null;

    for (const f of incomingFiles) {
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`"${f.name}" is too large (maximum 25 MB).`);
        continue;
      }
      const isImg = f.type.startsWith("image/") || allowedImgExts.test(f.name);
      const isAudio = f.type.startsWith("audio/") || allowedAudioExts.test(f.name);
      const isDoc = allowedDocExts.test(f.name);

      if (!isImg && !isDoc && !isAudio) {
        toast.error(`"${f.name}" format is not supported. Please upload PDF, DOCX, PNG, JPG, or audio files.`);
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

        // Process images sequentially to avoid mobile RAM exhaustion
        for (const file of newImages) {
          origBytes += file.size;
          try {
            // Immediate client-side downscale: max 1280px, 0.78 quality (under 500-800KB per image)
            const compressed = await compressImage(file, 1280, 0.78);
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
              toast.success(`${toAdd.length} ta rasm siqildi (${origMb} MB ➔ ${compMb} MB, -${saved}% tejandi) ⚡`, { duration: 4000 });
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
        if (img.size > 800 * 1024) {
          try {
            const comp = await compressImage(img, 1280, 0.78);
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

      // Direct-to-B2 Upload Optimization: bypass backend memory for voice notes and documents
      let directStorageUrl: string | null = null;
      let directFileName: string | null = null;

      if (voiceFile) {
        try {
          directStorageUrl = await uploadDirectToB2(
            voiceFile,
            voiceFile.name || `voice_${Date.now()}.webm`,
            voiceFile.type || "audio/webm"
          );
          directFileName = voiceFile.name || "voice_recording.webm";
        } catch (uploadErr) {
          console.warn("[B2 DIRECT] Direct B2 upload bypassed; falling back to server multipart:", uploadErr);
          directStorageUrl = null;
        }
      } else if (docFile) {
        try {
          directStorageUrl = await uploadDirectToB2(
            docFile,
            docFile.name || `doc_${Date.now()}.bin`,
            docFile.type || "application/octet-stream"
          );
          directFileName = docFile.name;
        } catch (uploadErr) {
          console.warn("[B2 DIRECT] Direct B2 upload bypassed; falling back to server multipart:", uploadErr);
          directStorageUrl = null;
        }
      }

      await submitHomework(
        assignment.id,
        combinedText,
        directStorageUrl ? null : primaryFile,
        finalImages,
        directStorageUrl ? null : voiceFile,
        directStorageUrl ? null : docFile,
        directStorageUrl,
        directFileName
      );

      // Clean up saved draft on successful submission
      try {
        sessionStorage.removeItem(`lms_draft_${assignment.id}`);
        localStorage.removeItem(`lms_draft_${assignment.id}`);
      } catch {}

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
        errorMsg = "Uploaded file size exceeds the allowed limit. Please compress or select smaller files.";
      } else if (status === 403) {
        errorMsg = "You do not have permission to submit this assignment or the task is locked.";
      } else if (status === 409) {
        errorMsg = "This assignment has already been submitted or a conflict occurred.";
      } else if (status === 500 || status === 502) {
        errorMsg = "A server error occurred (500/502). Please try submitting again.";
      } else if (status === 504) {
        errorMsg = "The server request timed out (504 Gateway Timeout). Please try again.";
      } else if (err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout")) {
        errorMsg = "Network timeout. Please check your connection and try again.";
      } else if (typeof window !== "undefined" && !window.navigator.onLine) {
        errorMsg = "No internet connection. Your device appears to be offline.";
      } else if (err?.message && !err.message.includes("Network Error")) {
        errorMsg = `An error occurred: ${err.message}`;
      } else {
        errorMsg = "Failed to submit assignment. Please try again.";
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
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate("/student/assignments")}
            className="btn-primary inline-flex items-center gap-2 text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Active Tasks</span>
          </button>
          <button
            onClick={() => navigate("/student/past-deadlines")}
            className="btn-secondary inline-flex items-center gap-2 text-xs"
          >
            <span>Past Deadlines Hub</span>
          </button>
        </div>
      </div>
    );
  }

  const skillBadge = getSkillBadge(assignment.title);
  const countdown = getCountdownInfo(assignment.deadline);
  const isElapsedDeadline = Boolean(
    assignment.is_past_deadline ||
    (assignment.deadline && new Date(assignment.deadline).getTime() < Date.now())
  );
  // Do NOT lock past-deadline assignments; keep inputs and submit CTA unlocked for late catch-up submission!
  const isTaskLocked = Boolean(
    !isElapsedDeadline &&
    assignment.is_locked &&
    assignment.prerequisite_id !== assignment.id &&
    !assignment.title.toLowerCase().includes("ket listening test2")
  );
  const isGraded = assignment.submission_status === "graded";
  const isPastDeadline = isElapsedDeadline;
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
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[#FBFBFA] dark:bg-[#0B0F19] text-zinc-900 dark:text-zinc-100 pb-20 sm:pb-0">
      {/* 1. Rigid Sticky Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6 py-3 transition-colors">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Back Button & Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => {
                if (isElapsedDeadline) {
                  navigate("/student/past-deadlines");
                } else {
                  navigate("/student/assignments");
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95 shrink-0"
              title="Return to coursework list"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isElapsedDeadline ? "Back to Past Deadlines" : "Back to Tasks"}
              </span>
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

        {/* Past Deadline Submission Notice Banner */}
        {isPastDeadline && !isGraded && (
          <div className="rounded-2xl border border-amber-300 dark:border-amber-700/80 bg-amber-500/10 dark:bg-amber-950/40 p-4 sm:p-5 flex items-start gap-3 shadow-xs">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Past Deadline Submission
              </h4>
              <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                You are submitting after the due date. This submission will be marked as Late for your instructor.
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

              <VocabPracticeWidget
                assignmentId={assignment.id}
                words={assignment.vocab_words}
                initialAttempt={existingSubmission?.vocab_attempt}
                onAttemptCompleted={(newAttempt) => {
                  setExistingSubmission((prev) => (prev ? { ...prev, vocab_attempt: newAttempt } : prev));
                }}
              />
            </div>
          )}
        </section>

        {/* Discussion & Questions Prompt Card */}
        <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/70 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-purple-950/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl shrink-0">
              💬
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Have a question about this assignment?</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono">
                  {assignment.comment_count ?? 0} comments
                </span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Ask your instructor questions or discuss points with your classmates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDiscussionOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xs transition shrink-0 self-end sm:self-auto"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Questions & Discussion</span>
          </button>
        </div>

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

                  {/* Hidden File Inputs */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleFilesAdded(files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={dropzoneInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleFilesAdded(files);
                      e.target.value = "";
                    }}
                  />

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
                    className={`border-2 border-dashed rounded-2xl p-5 sm:p-7 text-center transition-all duration-200 ${
                      isDragging
                        ? "border-indigo-500 bg-indigo-500/[0.08] scale-[1.005] ring-4 ring-indigo-500/10"
                        : "border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/40"
                    }`}
                  >
                    <UploadCloud className="mx-auto h-9 w-9 text-indigo-500 dark:text-indigo-400 mb-2" />
                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      Drag & drop workbook photos or documents
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-4">
                      PNG, JPG, PDF, DOCX · Instant client-side compression · Paste with <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-xs font-mono font-bold">Ctrl+V</kbd>
                    </p>

                    {/* Direct Action Buttons: Photo & Document Picker */}
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Add Photos (Camera / Gallery)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => dropzoneInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-indigo-500" />
                        <span>Browse Documents</span>
                      </button>
                    </div>
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

                  {/* Uploaded Photos Grid with Incremental "Add Photo" Card */}
                  {submissionImages.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <ImageIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                          Uploaded Photos ({submissionImages.length}/10)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Add More</span>
                          </button>
                          <span className="text-zinc-300 dark:text-zinc-700">|</span>
                          <button
                            type="button"
                            onClick={() => setSubmissionImages([])}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>
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

                        {/* Incremental "Add Photo" Card inside grid if under 10 photos */}
                        {submissionImages.length < 10 && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className="w-full h-full min-h-[90px] border-2 border-dashed border-emerald-500/40 dark:border-emerald-500/30 rounded-xl aspect-square flex flex-col items-center justify-center p-2 text-center hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition group cursor-pointer"
                              title="Add more photos"
                            >
                              <Camera className="w-6 h-6 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                                + Add Photo
                              </span>
                            </button>
                          </div>
                        )}
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
                    onAudioRecorded={(file) => {
                      if (file) {
                        setVoiceFile(file);
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
            {existingSubmission.images && existingSubmission.images.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Attached Photos ({existingSubmission.images.length}):</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {existingSubmission.images.map((img, idx) => (
                    <AuthenticatedImage
                      key={img.id || idx}
                      url={`/api/submissions/${existingSubmission.id}/images/${img.id}`}
                      alt={`Submitted Photo ${idx + 1}`}
                      className="rounded-lg object-cover aspect-square border border-zinc-200 dark:border-zinc-800 w-full"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* AI Automated Feedback Card */}
            {existingSubmission.ai_feedback ? (
              <div className="pt-2">
                <AIFeedbackCard
                  feedback={existingSubmission.ai_feedback}
                  submissionId={existingSubmission.id}
                  isTeacher={false}
                  onRetry={handleTriggerAI}
                  isRetrying={isRetryingAI}
                />
              </div>
            ) : (
              (existingSubmission.text_answer || existingSubmission.file_url) && (
                <div className="pt-2 flex items-center justify-between p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✨</span>
                    <div>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white block">
                        AI Examiner Feedback
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Get instant Cambridge & IELTS feedback on your submitted work
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerAI}
                    disabled={isRetryingAI}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0"
                  >
                    <span>{isRetryingAI ? "Evaluating..." : "Generate AI Review"}</span>
                  </button>
                </div>
              )
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
                    <span>Submitting...</span>
                  </>
                ) : isCompressingImages ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Compressing images...</span>
                  </>
                ) : isPastDeadline ? (
                  <>
                    <span>Submit Late Homework</span>
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
                onClick={() => {
                  if (isElapsedDeadline) {
                    navigate("/student/past-deadlines");
                  } else {
                    navigate("/student/assignments");
                  }
                }}
                className="w-full sm:w-64 py-3 px-6 rounded-xl btn-secondary text-sm font-semibold flex items-center justify-center min-h-[44px]"
              >
                {isElapsedDeadline ? "Return to Past Deadlines" : "Return to Assignments"}
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

interface VocabQuestion {
  targetWord: any;
  promptText: string;
  correctAnswer: string;
  options: string[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuizQuestions(wordList: any[]): VocabQuestion[] {
  if (!wordList || wordList.length === 0) return [];
  const valid = wordList.filter((w) => w && w.english_word && w.translation);
  const shuffledWords = shuffleArray(valid);

  return shuffledWords.map((currentWord) => {
    const promptText = currentWord.english_word.trim();
    const correctAnswer = currentWord.translation.trim();

    // Pool of other translations
    const otherTranslations = valid
      .filter((w) => w.english_word.trim().toLowerCase() !== promptText.toLowerCase() && w.translation.trim().toLowerCase() !== correctAnswer.toLowerCase())
      .map((w) => w.translation.trim());

    const uniqueDistractors = Array.from(new Set(otherTranslations));
    const chosenDistractors = shuffleArray(uniqueDistractors).slice(0, 3);
    const allOptions = shuffleArray([correctAnswer, ...chosenDistractors]);

    return {
      targetWord: currentWord,
      promptText,
      correctAnswer,
      options: allOptions,
    };
  });
}

function VocabPracticeWidget({
  assignmentId,
  words,
  initialAttempt,
  onAttemptCompleted,
}: {
  assignmentId: string;
  words: any[];
  initialAttempt?: any;
  onAttemptCompleted?: (attempt: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [questions, setQuestions] = useState<VocabQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptCount, setAttemptCount] = useState<number>(initialAttempt?.attempt_count || 1);
  const [activeAttempt, setActiveAttempt] = useState<any>(initialAttempt || null);

  useEffect(() => {
    if (initialAttempt) {
      setActiveAttempt(initialAttempt);
      if (initialAttempt.attempt_count) {
        setAttemptCount(initialAttempt.attempt_count);
      }
    }
  }, [initialAttempt]);

  if (!words || words.length === 0) return null;

  function playWordAudio(text: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  }

  function startQuiz(isReplay = false) {
    const qList = buildQuizQuestions(words);
    setQuestions(qList);
    setCurrentIdx(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setCorrectCount(0);
    setCompleted(false);
    setIsOpen(true);

    if (isReplay) {
      setAttemptCount((prev) => prev + 1);
    }

    if (qList.length > 0) {
      playWordAudio(qList[0].promptText);
    }
  }

  function handleSelectOption(opt: string) {
    if (isAnswerChecked || isSubmitting) return;
    setSelectedOption(opt);
    setIsAnswerChecked(true);

    const q = questions[currentIdx];
    const isCorrect = opt.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    }
  }

  async function handleNextQuestion() {
    const q = questions[currentIdx];
    const isCorrect = selectedOption?.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    const finalCorrect = isCorrect ? correctCount : correctCount; // correctCount already updated on select

    if (currentIdx + 1 < questions.length) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      playWordAudio(questions[nextIdx].promptText);
    } else {
      setCompleted(true);
      setIsSubmitting(true);
      try {
        const res = await recordVocabPractice({
          assignment_id: assignmentId,
          total_words: questions.length,
          correct_words: finalCorrect,
        });

        const newAttemptData = {
          percentage: res.percentage ?? Math.round((finalCorrect / questions.length) * 100),
          best_percentage: res.best_percentage ?? res.percentage,
          attempt_count: res.attempt_count ?? attemptCount,
          correct_answers: finalCorrect,
          total_questions: questions.length,
          is_completed: true,
          completed_at: new Date().toISOString(),
        };

        setActiveAttempt(newAttemptData);
        if (onAttemptCompleted) {
          onAttemptCompleted(newAttemptData);
        }

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
      <div className="space-y-2">
        {activeAttempt ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-purple-200 dark:border-purple-800/70 bg-purple-50/60 dark:bg-purple-950/30">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 flex items-center justify-center text-lg shrink-0">
                📖
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs sm:text-sm text-purple-900 dark:text-purple-200">
                    New Words Mastery: {activeAttempt.percentage}%
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-700">
                    Attempt {activeAttempt.attempt_count}
                  </span>
                </div>
                <p className="text-[11px] text-purple-600 dark:text-purple-400">
                  {activeAttempt.correct_answers} / {activeAttempt.total_questions} words correct
                  {activeAttempt.best_percentage !== undefined && ` · Best: ${activeAttempt.best_percentage}%`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => startQuiz(true)}
              className="btn-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-xs shrink-0 self-stretch sm:self-auto justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replay Quiz</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => startQuiz(false)}
            className="w-full btn-sm bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition"
          >
            <span>🎯 Practice "New Words" Quiz (+15 XP / +10 ⭐)</span>
          </button>
        )}
      </div>
    );
  }

  if (completed) {
    const finalPct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
    const isHigh = finalPct >= 80;

    return (
      <div className="p-5 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-2xl text-center space-y-4 shadow-xs">
        <div className="space-y-1">
          <div className="inline-flex p-3 rounded-2xl bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 mb-1">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="font-bold text-base text-purple-900 dark:text-purple-100">
            {finalPct === 100 ? "100% Perfect Mastery! 🏆" : isHigh ? "Great Job! Mastery Achieved! 🎉" : "Quiz Finished!"}
          </p>
          <p className="text-2xl font-black font-mono text-purple-800 dark:text-purple-200">
            {finalPct}%
          </p>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            {correctCount} of {questions.length} words correct · Attempt #{attemptCount}
          </p>
        </div>

        {/* Gamification badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-purple-900/40 border border-purple-200 dark:border-purple-700 text-xs font-semibold text-purple-800 dark:text-purple-200 font-mono">
          <span>🎯 +15 XP</span>
          {isHigh && <span className="text-amber-600 dark:text-amber-400">· ⭐️ +10 Stars</span>}
        </div>

        {/* Replay action buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => startQuiz(true)}
            className="flex-1 btn-primary py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay & Beat Score</span>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="btn-secondary py-2.5 px-5 rounded-xl text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  if (!currentQ) return null;

  const optionLetters = ["A", "B", "C", "D"];

  return (
    <div className="p-4 sm:p-5 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/70 rounded-2xl space-y-4 shadow-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-purple-200/60 dark:border-purple-800/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-700">
            Word {currentIdx + 1} / {questions.length}
          </span>
          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">
            Score: {correctCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 bg-white dark:bg-purple-900/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-700 font-semibold">
            Attempt #{attemptCount}
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Target Word Prompt */}
      <div className="space-y-1 text-center py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
          Translate to Uzbek:
        </p>
        <div className="inline-flex items-center justify-center gap-2.5">
          <p className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            {currentQ.promptText}
          </p>
          <button
            type="button"
            onClick={() => playWordAudio(currentQ.promptText)}
            className="p-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/60 dark:hover:bg-purple-800/60 text-purple-700 dark:text-purple-300 transition"
            title="Hear pronunciation"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Shuffled Multiple-Choice Options with Randomized Distractors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {currentQ.options.map((opt, idx) => {
          const letter = optionLetters[idx] || String(idx + 1);
          const isSelected = selectedOption === opt;
          const isCorrect = opt.trim().toLowerCase() === currentQ.correctAnswer.trim().toLowerCase();

          let btnClass = "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:border-purple-300 dark:hover:border-purple-700";

          if (isAnswerChecked) {
            if (isCorrect) {
              btnClass = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold shadow-xs";
            } else if (isSelected && !isCorrect) {
              btnClass = "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200";
            } else {
              btnClass = "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-zinc-400 opacity-60";
            }
          } else if (isSelected) {
            btnClass = "border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 shadow-xs";
          }

          return (
            <button
              key={`${opt}-${idx}`}
              type="button"
              disabled={isAnswerChecked}
              onClick={() => handleSelectOption(opt)}
              className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2.5 transition active:scale-[0.99] text-xs sm:text-sm font-medium ${btnClass}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  {letter}
                </span>
                <span className="truncate">{opt}</span>
              </div>

              {isAnswerChecked && isCorrect && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              {isAnswerChecked && isSelected && !isCorrect && (
                <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer: Next Question Button */}
      {isAnswerChecked && (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleNextQuestion}
            disabled={isSubmitting}
            className="btn-primary py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-1.5"
          >
            <span>{currentIdx + 1 === questions.length ? "Finish Quiz & Record Score" : "Next Word ➔"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

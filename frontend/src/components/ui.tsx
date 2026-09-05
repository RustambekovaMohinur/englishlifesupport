import { ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { downloadAuthenticatedFile, fetchAuthenticatedBlobUrl } from "@/services/api";

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <div className={`flex ${className} items-center justify-center rounded-xl bg-brand-500 font-extrabold text-white`}>
      AK
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-neutral-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  submitted: "bg-blue-50 text-blue-700",
  late: "bg-amber-50 text-amber-700",
  graded: "bg-green-50 text-green-700",
  active: "bg-green-50 text-green-700",
  inactive: "bg-neutral-100 text-neutral-500",
  published: "bg-emerald-50 text-emerald-700",
  draft: "bg-amber-50 text-amber-700",
  pending: "bg-neutral-100 text-neutral-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusStyles[status] ?? "bg-neutral-100 text-neutral-600"}`}>{status}</span>;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className} text-brand-500`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
      <p className="text-base font-semibold text-neutral-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FileDownloadButton({
  url,
  filename,
  className,
  children,
}: {
  url: string;
  filename?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await downloadAuthenticatedFile(url, filename ?? undefined);
    } catch {
      toast.error("Failed to download file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={handleClick} disabled={busy}>
      {busy ? "Downloading..." : children}
    </button>
  );
}

export function AuthenticatedAudio({ url, className }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchAuthenticatedBlobUrl(url)
      .then((blobUrl) => {
        objectUrl = blobUrl;
        if (!cancelled) setSrc(blobUrl);
        else URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load audio");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) return <p className="text-xs text-neutral-400">Loading audio...</p>;
  return <audio controls src={src} className={className} />;
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; message: string; onConfirm: () => void }>({
    open: false,
    message: "",
    onConfirm: () => {},
  });

  const confirm = (message: string, onConfirm: () => void) => setState({ open: true, message, onConfirm });
  const close = () => setState((s) => ({ ...s, open: false }));

  const ConfirmDialog = () =>
    state.open ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-sm text-neutral-700">{state.message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-secondary" onClick={close}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                state.onConfirm();
                close();
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return { confirm, ConfirmDialog };
}

export function ImageLightbox({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
}: {
  isOpen: boolean;
  images: { url: string; name?: string }[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const currentImage = images[currentIndex];

  useEffect(() => {
    if (!isOpen || !currentImage) {
      setBlobUrl(null);
      return;
    }
    let active = true;
    setLoading(true);
    let objUrl: string | null = null;

    if (currentImage.url.startsWith("blob:") || currentImage.url.startsWith("data:")) {
      setBlobUrl(currentImage.url);
      setLoading(false);
    } else {
      fetchAuthenticatedBlobUrl(currentImage.url)
        .then((url) => {
          objUrl = url;
          if (active) {
            setBlobUrl(url);
            setLoading(false);
          } else {
            URL.revokeObjectURL(url);
          }
        })
        .catch(() => {
          if (active) {
            setLoading(false);
            toast.error("Failed to load image");
          }
        });
    }

    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [isOpen, currentImage?.url]);

  if (!isOpen || !currentImage) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-medium text-white/80">
          {currentIndex + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white hover:bg-white/30 transition-colors z-10"
            title="Previous image"
          >
            ‹
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white hover:bg-white/30 transition-colors z-10"
            title="Next image"
          >
            ›
          </button>
        </>
      )}

      <div className="relative max-h-[85vh] max-w-[90vw] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="flex h-64 w-64 items-center justify-center">
            <Spinner className="h-10 w-10 text-white" />
          </div>
        ) : blobUrl ? (
          <img
            src={blobUrl}
            alt={currentImage.name || "Preview"}
            className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <p className="text-white">Unable to display image</p>
        )}
        {currentImage.name && (
          <p className="mt-3 text-center text-xs text-white/70 truncate max-w-md">
            {currentImage.name}
          </p>
        )}
      </div>
    </div>
  );
}

export function AuthenticatedImage({
  url,
  alt = "Image",
  className = "",
  onClick,
}: {
  url: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    setLoading(true);

    if (url.startsWith("blob:") || url.startsWith("data:")) {
      setSrc(url);
      setLoading(false);
      return;
    }

    fetchAuthenticatedBlobUrl(url)
      .then((blobUrl) => {
        objUrl = blobUrl;
        if (active) {
          setSrc(blobUrl);
          setLoading(false);
        } else {
          URL.revokeObjectURL(blobUrl);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 rounded-lg animate-pulse ${className}`}>
        <Spinner className="h-4 w-4 text-neutral-400" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 rounded-lg text-xs text-neutral-400 ${className}`}>
        🖼️
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      loading="lazy"
    />
  );
}

export function VoiceRecorder({
  onRecordingComplete,
  disabled = false,
}: {
  onRecordingComplete: (file: File) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  useEffect(() => {
    let interval: any;
    if (recording) {
      interval = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [recording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: finalType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);

        const ext = finalType.includes("mp4") ? "m4a" : "webm";
        const audioFile = new File([blob], `voice_recording_${Date.now()}.${ext}`, { type: finalType });
        onRecordingComplete(audioFile);

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
      setRecordingTime(0);
      setAudioUrl(null);
      setAudioBlob(null);
    } catch (err) {
      toast.error("Microphone access denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800">🎙️ Speaking Voice Recording</span>
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-red-600"></span>
              REC {formatTimer(recordingTime)}
            </span>
          )}
        </div>
        {audioUrl && !recording && (
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
            ✓ Audio recorded
          </span>
        )}
      </div>

      {!recording && !audioUrl && (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-white border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 shadow-sm transition-all disabled:opacity-50"
        >
          <span>🎙️</span>
          <span>Start Recording</span>
        </button>
      )}

      {recording && (
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center justify-center gap-1 h-10 bg-red-50/80 rounded-lg border border-red-200">
            <span className="h-3 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="h-5 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="h-4 w-1 bg-red-500 rounded-full animate-bounce"></span>
            <span className="h-6 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
            <span className="h-3 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.4s]"></span>
            <span className="ml-2 text-xs font-medium text-red-700">Recording live voice...</span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-1.5 py-2 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm"
          >
            <span>⏹️</span>
            <span>Stop</span>
          </button>
        </div>
      )}

      {audioUrl && !recording && (
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <audio controls src={audioUrl} className="w-full h-10 rounded-lg" />
          <button
            type="button"
            onClick={resetRecording}
            className="whitespace-nowrap text-xs font-medium text-neutral-500 hover:text-red-600 py-1.5 px-2.5 rounded hover:bg-red-50 transition-colors"
          >
            🔄 Re-record
          </button>
        </div>
      )}
    </div>
  );
}


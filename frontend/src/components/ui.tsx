import { ReactNode, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { downloadAuthenticatedFile, fetchAuthenticatedBlobUrl, getAuthenticatedImageUrl } from "@/services/api";

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <div className={`flex ${className} items-center justify-center rounded-xl bg-brand-500 font-extrabold text-white`}>
      AK
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  iconBg = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  iconBg?: string;
}) {
  return (
    <div className="card hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group relative">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{label}</p>
        {icon && (
          <div className={`p-1.5 rounded-lg shrink-0 ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>
      <p className="mt-2 font-bold text-2xl tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{hint}</p>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  submitted: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  late: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  graded: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  active: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  inactive: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
  published: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  draft: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  pending: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusStyles[status] ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>{status}</span>;
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#EAE9E5] dark:border-[#30363D] bg-white dark:bg-[#161B22] px-6 py-16 text-center">
      <p className="text-base font-semibold text-zinc-900 dark:text-white">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/60" />
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="fixed inset-x-0 bottom-0 sm:static max-h-[85vh] sm:max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 sm:border-[#EAE9E5] sm:dark:border-[#30363D] bg-white dark:bg-[#161B22] p-5 sm:p-6 shadow-2xl text-zinc-900 dark:text-zinc-100 animate-in slide-in-from-bottom duration-200 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        {/* Top Drag Indicator (w-10 h-1 rounded-full) */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300 transition active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close modal"
          >
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

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

  function changeRate(rate: number) {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }

  if (!src) return <p className="text-xs text-neutral-400">Loading audio...</p>;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <audio ref={audioRef} controls src={src} className={className} />
      <div className="flex items-center gap-1 shrink-0">
        {[1.0, 1.25, 1.5, 2.0].map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => changeRate(rate)}
            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition ${
              playbackRate === rate
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>
    </div>
  );
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
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [triedBlobFallback, setTriedBlobFallback] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setRotation(0);
    setScale(1);
  }, [initialIndex, isOpen]);

  const currentImage = images[currentIndex];

  useEffect(() => {
    if (!isOpen || !currentImage) {
      setDisplayUrl(null);
      setLoading(false);
      setHasError(false);
      setTriedBlobFallback(false);
      return;
    }

    setLoading(true);
    setHasError(false);
    setTriedBlobFallback(false);
    setRotation(0);
    setScale(1);

    if (currentImage.url.startsWith("blob:") || currentImage.url.startsWith("data:")) {
      setDisplayUrl(currentImage.url);
      setLoading(false);
      return;
    }

    const direct = getAuthenticatedImageUrl(currentImage.url);
    setDisplayUrl(direct);
  }, [isOpen, currentIndex, currentImage?.url]);

  // Keyboard navigation: Esc, Left, Right, Rotate
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else if (e.key === "r" || e.key === "R") {
        setRotation((prev) => (prev + 90) % 360);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, images.length, onClose]);

  if (!isOpen || !currentImage) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleImageLoad = () => {
    setLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    if (!triedBlobFallback && currentImage && !currentImage.url.startsWith("blob:") && !currentImage.url.startsWith("data:")) {
      setTriedBlobFallback(true);
      fetchAuthenticatedBlobUrl(currentImage.url)
        .then((blobUrl) => {
          setDisplayUrl(blobUrl);
          setLoading(false);
          setHasError(false);
        })
        .catch(() => {
          setHasError(true);
          setLoading(false);
        });
    } else {
      setHasError(true);
      setLoading(false);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    setHasError(false);
    setTriedBlobFallback(false);
    fetchAuthenticatedBlobUrl(currentImage.url)
      .then((blobUrl) => {
        setDisplayUrl(blobUrl);
        setLoading(false);
        setHasError(false);
      })
      .catch(() => {
        setHasError(true);
        setLoading(false);
        toast.error("Rasm yuklanmadi");
      });
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentImage?.url) {
      downloadAuthenticatedFile(currentImage.url, currentImage.name || `scan_${currentIndex + 1}.jpg`)
        .catch(() => toast.error("Yuklab olishda xatolik yuz berdi"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-md p-2 sm:p-4 select-none"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="absolute top-3 left-4 right-4 flex items-center justify-between z-20 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white">
          <span className="text-xs font-semibold">
            {currentIndex + 1} / {images.length}
          </span>
          {currentImage.name && (
            <span className="text-xs text-white/70 max-w-[160px] sm:max-w-xs truncate border-l border-white/20 pl-2">
              {currentImage.name}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10 text-white">
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white text-xs flex items-center gap-1 px-2.5"
            title="Rotate 90° (R)"
          >
            🔄 <span className="hidden sm:inline">Rotate</span>
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => (s < 2.5 ? s + 0.25 : 1))}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white text-xs flex items-center gap-1 px-2.5"
            title="Zoom (+)"
          >
            🔍 {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white text-xs flex items-center gap-1 px-2.5"
            title="Download scan"
          >
            ⬇️ <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white ml-1 px-2.5 font-bold text-sm"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Prev / Next Arrows */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl w-11 h-11 flex items-center justify-center transition-all z-20 backdrop-blur-sm"
            title="Previous image (←)"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl w-11 h-11 flex items-center justify-center transition-all z-20 backdrop-blur-sm"
            title="Next image (→)"
          >
            ›
          </button>
        </>
      )}

      {/* Main Image Stage */}
      <div
        className="relative max-h-[86vh] max-w-[92vw] flex flex-col items-center justify-center overflow-auto pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3 bg-black/60 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/10 text-white">
              <Spinner className="h-8 w-8 text-white" />
              <span className="text-xs text-white/80 font-medium">Rasm yuklanmoqda...</span>
            </div>
          </div>
        )}

        {displayUrl && !hasError ? (
          <img
            src={displayUrl}
            alt={currentImage.name || "Preview"}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{
              transform: `rotate(${rotation}deg) scale(${scale})`,
              transition: "transform 0.2s ease-out",
            }}
            className={`max-h-[82vh] max-w-[90vw] rounded-xl object-contain shadow-2xl transition-opacity duration-200 ${
              loading ? "opacity-30" : "opacity-100"
            }`}
          />
        ) : null}

        {hasError && (
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-zinc-900/90 border border-zinc-700 text-white max-w-sm text-center">
            <span className="text-3xl">🖼️</span>
            <div className="space-y-1">
              <p className="font-semibold text-sm">Rasmni to'g'ridan-to'g'ri ko'rsatib bo'lmadi</p>
              <p className="text-xs text-zinc-400">
                Internet uzilishi yoki rasm serverda qayta yuklanayotgan bo'lishi mumkin.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleRetry}
                className="px-3.5 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition"
              >
                Qayta urinish
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition"
              >
                Faylni yuklab olish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const imageBlobCache = new Map<string, string>();

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
  const [src, setSrc] = useState<string | null>(() => {
    if (!url) return null;
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (imageBlobCache.has(url)) return imageBlobCache.get(url)!;
    return getAuthenticatedImageUrl(url);
  });
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHasError(false);

    if (!url) {
      setLoading(false);
      return;
    }

    if (url.startsWith("blob:") || url.startsWith("data:") || (url.startsWith("http") && !url.includes("/api/"))) {
      setSrc(url);
      setLoading(false);
      return;
    }

    if (imageBlobCache.has(url)) {
      setSrc(imageBlobCache.get(url)!);
      setLoading(false);
      return;
    }

    const directUrl = getAuthenticatedImageUrl(url);
    setSrc(directUrl);

    return () => {
      active = false;
    };
  }, [url]);

  const handleLoad = () => {
    setLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    // If direct token URL failed, try fallback to fetchAuthenticatedBlobUrl
    if (url && !imageBlobCache.has(url) && !url.startsWith("blob:") && !url.startsWith("data:")) {
      fetchAuthenticatedBlobUrl(url)
        .then((blobUrl) => {
          imageBlobCache.set(url, blobUrl);
          setSrc(blobUrl);
          setLoading(false);
          setHasError(false);
        })
        .catch(() => {
          setHasError(true);
          setLoading(false);
        });
    } else {
      setHasError(true);
      setLoading(false);
    }
  };

  if (hasError || !src) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={alt || "View Photo"}
        className={`flex flex-col items-center justify-center gap-1 bg-zinc-100/90 hover:bg-zinc-200/90 dark:bg-zinc-800/90 dark:hover:bg-zinc-700/90 text-zinc-600 dark:text-zinc-300 rounded-lg p-2 transition active:scale-95 group text-center cursor-pointer border border-zinc-200 dark:border-zinc-700 ${className}`}
      >
        <span className="text-xl group-hover:scale-110 transition-transform">🖼️</span>
        <span className="text-[10px] font-semibold truncate max-w-full px-1">
          {alt || "Photo"}
        </span>
        <span className="text-[9px] text-brand-600 dark:text-brand-400 group-hover:underline">
          🔍 Click to view
        </span>
      </button>
    );
  }

  return (
    <div className={`relative ${className} overflow-hidden`} onClick={onClick}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 animate-pulse">
          <Spinner className="h-4 w-4 text-zinc-400" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          loading ? "opacity-0" : "opacity-100"
        }`}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        decoding="async"
      />
    </div>
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Brauzeringizda ovoz yozish imkoniyati cheklangan. Audio fayl yuklashingiz mumkin.", {
        id: "mic-unsupported",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      });
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
      toast.error("Mikrofon ruxsati berilmadi. Fayl sifatida .mp3/.m4a yuklashingiz mumkin.", {
        id: "mic-access-error",
      });
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

export { ThemeToggle, toggleTheme } from "./ThemeToggle";

export function TelegramLink({
  username,
  className = "",
}: {
  username?: string | null;
  className?: string;
}) {
  if (!username || !username.trim()) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }
  const clean = username.trim().replace(/^@+/, "");
  // Sanitize: Telegram usernames are letters, digits, and underscores (3-32 chars)
  const isValid = /^[a-zA-Z0-9_]{3,32}$/.test(clean);
  if (!isValid) {
    return (
      <span className={`text-zinc-700 dark:text-zinc-300 font-mono text-xs ${className}`}>
        {username.startsWith("@") ? username : `@${username}`}
      </span>
    );
  }
  return (
    <a
      href={`https://t.me/${encodeURIComponent(clean)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Chat on Telegram with @${clean}`}
      className={`inline-flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline text-xs bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-lg border border-sky-200/60 dark:border-sky-800/60 transition shadow-2xs ${className}`}
    >
      <span className="text-[11px] leading-none">✈️</span>
      <span className="font-mono">@{clean}</span>
    </a>
  );
}


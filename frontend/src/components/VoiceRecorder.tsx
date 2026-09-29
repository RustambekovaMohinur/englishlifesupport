import React, { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";

export interface VoiceRecorderProps {
  onRecordingComplete?: (file: File) => void;
  onAudioRecorded?: (file: File | null) => void;
  existingAudio?: File | Blob | null;
  disabled?: boolean;
}

export function VoiceRecorder({
  onRecordingComplete,
  onAudioRecorded,
  existingAudio,
  disabled = false,
}: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize existingAudio URL if supplied
  useEffect(() => {
    if (existingAudio && !audioUrl) {
      const url = URL.createObjectURL(existingAudio);
      setAudioUrl(url);
    }
  }, [existingAudio, audioUrl]);

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

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Microphone access is not supported by your browser. You can upload an audio file instead.", {
        id: "mic-unsupported",
      });
      return;
    }

    chunksRef.current = [];

    // Explicit AudioContext activation on user gesture for iOS Safari (WebKit)
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }
      }
    } catch (e) {
      console.warn("AudioContext activation warning:", e);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Fix MIME-type selection order: prioritize MP4/AAC for iOS Safari compatibility
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/aac")
        ? "audio/aac"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/wav";

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: 32000,
        });
      } catch {
        try {
          recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        } catch {
          recorder = new MediaRecorder(stream);
        }
      }

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: finalType });

        if (blob.size === 0) {
          toast.error("Recording was empty. Please check microphone permissions and try again.", {
            id: "empty-recording-error",
          });
          setAudioUrl(null);
          setAudioBlob(null);
          setRecording(false);
          setRecordingTime(0);
          if (onAudioRecorded) onAudioRecorded(null);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          return;
        }

        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);

        const ext = finalType.includes("mp4") || finalType.includes("aac")
          ? "m4a"
          : finalType.includes("webm")
          ? "webm"
          : finalType.includes("ogg")
          ? "ogg"
          : "wav";

        const audioFile = new File([blob], `voice_recording_${Date.now()}.${ext}`, {
          type: finalType,
          lastModified: Date.now(),
        });

        if (onRecordingComplete) onRecordingComplete(audioFile);
        if (onAudioRecorded) onAudioRecorded(audioFile);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      // Periodic data slicing every 250ms ensures buffer flush on iOS Safari
      recorder.start(250);
      setMediaRecorder(recorder);
      setRecording(true);
      setRecordingTime(0);
      setAudioUrl(null);
      setAudioBlob(null);
    } catch (err) {
      console.error("Microphone hardware error:", err);
      toast.error("Microphone access denied. You can upload an .mp3/.m4a file instead.", {
        id: "mic-access-error",
      });
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.requestData();
        }
      } catch {
        // Safe fallback
      }
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
    chunksRef.current = [];
    if (onAudioRecorded) onAudioRecorded(null);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-neutral-50/50 dark:bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800 dark:text-zinc-200">🎙️ Speaking Submission (Audio Record)</span>
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950/40 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-red-600"></span>
              RECORDING {formatTimer(recordingTime)}
            </span>
          )}
        </div>
        {audioUrl && !recording && audioBlob && audioBlob.size > 0 && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full">
            ✓ Audio Recorded Successfully ({(audioBlob.size / 1024).toFixed(0)} KB)
          </span>
        )}
      </div>

      {!recording && !audioUrl && (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-white dark:bg-zinc-800 border border-neutral-300 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-200 hover:bg-neutral-50 dark:hover:bg-zinc-750 hover:border-neutral-400 shadow-sm transition-all disabled:opacity-50"
        >
          <span>🎙️</span>
          <span>Start Recording</span>
        </button>
      )}

      {recording && (
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center justify-center gap-1 h-10 bg-red-50/80 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
            <span className="h-3 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="h-5 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="h-4 w-1 bg-red-500 rounded-full animate-bounce"></span>
            <span className="h-6 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
            <span className="h-3 w-1 bg-red-500 rounded-full animate-bounce [animation-delay:-0.4s]"></span>
            <span className="ml-2 text-xs font-medium text-red-700 dark:text-red-400">Recording live audio...</span>
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
            className="whitespace-nowrap text-xs font-medium text-neutral-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 py-1.5 px-2.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            🔄 Record Again
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceRecorder;

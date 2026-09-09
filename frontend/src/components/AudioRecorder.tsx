import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Mic, Square, Play, Pause, RotateCcw, AlertCircle } from 'lucide-react';

interface AudioRecorderProps {
  onAudioRecorded: (blob: Blob | null) => void;
  existingAudio?: Blob | null;
}

export const AudioRecorderWidget: React.FC<AudioRecorderProps> = ({ onAudioRecorded, existingAudio }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micUnavailable, setMicUnavailable] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize existingAudio URL if supplied
  useEffect(() => {
    if (existingAudio && !audioUrl) {
      const url = URL.createObjectURL(existingAudio);
      setAudioUrl(url);
    }
  }, [existingAudio, audioUrl]);

  // Stop track streams safely on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setMicUnavailable(false);
    audioChunksRef.current = [];

    // Guard against unsupported environments
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Brauzeringizda ovoz yozish imkoniyati cheklangan. Audio fayl yuklashingiz mumkin.", {
        id: 'mic-unsupported'
      });
      setMicUnavailable(true);
      return;
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

      // Select supported audio mimeType with Opus compression
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      // 32 kbps produces pristine voice quality at only ~240 KB per minute instead of 4 MB!
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 32000,
      };
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
      }

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType || 'audio/webm' });
        console.log(`[AudioRecorder] Recorded voice note size: ${(audioBlob.size / 1024).toFixed(1)} KB`);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onAudioRecorded(audioBlob);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone hardware error:", err);
      // DEDUPLICATED SINGLETON TOAST: Never render multiple alerts
      toast.error("Mikrofon ruxsati berilmadi. Fayl sifatida .mp3/.m4a yuklashingiz mumkin.", {
        id: 'mic-access-error'
      });
      setMicUnavailable(true);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resetRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    onAudioRecorded(null);
    setRecordingDuration(0);
    setIsPlaying(false);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-5 space-y-4">
      {micUnavailable ? (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"/>
          <div className="space-y-1">
            <p className="font-semibold">Mikrofon apparatiga ulanib bo‘lmadi</p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Brauzeringiz sozlamalarida mikrofon ruxsati berilganligini tekshiring yoki ovozingizni diktofon orqali yozib, pastdagi fayl yuklash tugmasi orqali yuboring.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 space-y-3">
          {!audioUrl ? (
            <div className="flex flex-col items-center space-y-2">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-md ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-500/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'
                }`}
              >
                {isRecording ? <Square className="w-6 h-6 fill-current"/> : <Mic className="w-7 h-7"/>}
              </button>
              <span className="text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400">
                {isRecording ? `Yozilmoqda: ${formatTime(recordingDuration)}` : 'Yozishni boshlash'}
              </span>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#161B22] border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!audioElementRef.current) return;
                      if (isPlaying) {
                        audioElementRef.current.pause();
                        setIsPlaying(false);
                      } else {
                        audioElementRef.current.play();
                        setIsPlaying(true);
                      }
                    }}
                    className="p-2.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4 fill-current"/>}
                  </button>
                  <span className="text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                    Ovozli javob tayyor ({formatTime(recordingDuration)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetRecording}
                  className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:underline px-2 py-1"
                >
                  <RotateCcw className="w-3.5 h-3.5"/> Qaytadan yozish
                </button>
                <audio
                  ref={audioElementRef}
                  src={audioUrl}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

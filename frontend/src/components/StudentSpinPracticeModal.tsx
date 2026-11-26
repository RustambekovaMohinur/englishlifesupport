import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mic,
  PenTool,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Volume2,
  Shuffle,
  Clock,
  BookOpen,
  ArrowRight,
  Play,
  Square,
  Flame,
} from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Spinner } from "@/components/ui";
import { listSpinPrompts } from "@/services/lmsService";
import { SpinPrompt } from "@/types";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface StudentSpinPracticeModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: "speaking" | "writing";
}

const DEFAULT_SPEAKING_PROMPTS = [
  "Describe a memorable journey you took with your family or friends. Where did you go and what happened?",
  "Talk about a teacher or mentor who had a strong positive influence on your life. Why do you respect them?",
  "Describe an interesting skill or hobby you would love to learn in the future. How would it help you?",
  "Do you think artificial intelligence will replace human teachers in the future? Explain your viewpoint.",
  "Describe a traditional holiday or celebration in your culture. How do people celebrate it?",
  "Talk about a difficult decision you had to make recently. What was the outcome and what did you learn?",
  "Describe a book, movie, or speech that changed the way you think about the world.",
  "What are the advantages and disadvantages of living in a bustling big city versus a quiet countryside?",
  "How important is it for people to maintain a healthy work-life balance in modern society?",
  "Describe your favorite childhood memory. Why has it stayed with you for so long?",
];

const DEFAULT_WRITING_PROMPTS = [
  "Some people believe that university education should be completely free for all citizens. To what extent do you agree or disagree?",
  "Modern technology makes people more connected, yet many feel more isolated than ever. Discuss both views and give your opinion.",
  "Governments should invest more money in public transport systems rather than building new highways. Discuss the benefits.",
  "Children nowadays spend excessive hours on digital screens. What problems does this cause, and what solutions can parents implement?",
  "Is it better for high school graduates to take a gap year before entering university? Discuss the pros and cons.",
  "Some argue that success in life is determined by hard work, while others believe luck plays the main role. What is your perspective?",
  "Tourism brings great economic benefits to local communities, but also causes environmental harm. How can this balance be maintained?",
  "Write an essay discussing whether remote work will become the standard way of working across global industries.",
  "The rise of fast fashion has negative environmental consequences. Who should take responsibility: consumers or governments?",
  "Many traditional cultural customs are fading due to globalization. Is this a positive or negative development?",
];

const SEGMENT_COLORS = [
  "#6366F1", // Indigo
  "#10B981", // Emerald
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#0EA5E9", // Sky
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F43F5E", // Rose
];

export const StudentSpinPracticeModal: React.FC<StudentSpinPracticeModalProps> = ({
  open,
  onClose,
  defaultMode = "speaking",
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const studentGroupId = (user as any)?.group_id || (user as any)?.student_profile?.group_id || undefined;
  const [mode, setMode] = useState<"speaking" | "writing">(defaultMode);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFromTeacherDb, setIsFromTeacherDb] = useState(false);

  // Wheel and chosen prompt state
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [chosenPrompt, setChosenPrompt] = useState<string | null>(null);
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Practice Interactive Tools (Timer / Scratchpad)
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [scratchpadText, setScratchpadText] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerIntervalRef = useRef<any>(null);

  // Synchronize default mode
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
    }
  }, [open, defaultMode]);

  // Load prompts for current mode
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    listSpinPrompts({
      prompt_type: mode,
      group_id: studentGroupId,
      active_only: true,
      fallback: true,
    })
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setPrompts(items.map((i) => i.text));
          setIsFromTeacherDb(true);
        } else {
          setPrompts(mode === "speaking" ? DEFAULT_SPEAKING_PROMPTS : DEFAULT_WRITING_PROMPTS);
          setIsFromTeacherDb(false);
        }
      })
      .catch(() => {
        setPrompts(mode === "speaking" ? DEFAULT_SPEAKING_PROMPTS : DEFAULT_WRITING_PROMPTS);
        setIsFromTeacherDb(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, mode, studentGroupId]);

  // Timer logic
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isTimerRunning]);

  // Available prompt items (capped at 12 for the wheel visual)
  const activePromptList = useMemo(() => {
    if (prompts.length > 0) return prompts.slice(0, 12);
    return mode === "speaking" ? DEFAULT_SPEAKING_PROMPTS : DEFAULT_WRITING_PROMPTS;
  }, [prompts, mode]);

  const numSegments = activePromptList.length;
  const segmentAngle = 360 / numSegments;

  // Draw the animated wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 8;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationAngle * Math.PI) / 180);

    for (let i = 0; i < numSegments; i++) {
      const startAngle = (i * segmentAngle * Math.PI) / 180;
      const endAngle = ((i + 1) * segmentAngle * Math.PI) / 180;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fill();

      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number label on segment
      ctx.save();
      ctx.rotate((startAngle + endAngle) / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText(`${i + 1}`, radius - 12, 4);
      ctx.restore();
    }

    ctx.restore();

    // Center hub cap
    ctx.beginPath();
    ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
    ctx.fillStyle = "#111827";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = "#A855F7";
    ctx.fill();
  }, [rotationAngle, numSegments, segmentAngle]);

  // Audio tone helper
  const playSoundEffect = (freq: number, duration: number = 0.08) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  // Spin Wheel Action
  const handleSpin = () => {
    if (isSpinning || activePromptList.length === 0) return;

    setIsSpinning(true);
    setChosenPrompt(null);
    setTimerSeconds(0);
    setIsTimerRunning(false);

    // Pick a random target index
    const randomIndex = Math.floor(Math.random() * activePromptList.length);
    const chosen = activePromptList[randomIndex];

    // Calculate rotation: 5 full turns + target angle to land directly on top needle (270 deg)
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const targetSegmentCenter = randomIndex * segmentAngle + segmentAngle / 2;
    // 270 deg is top pointer (North needle)
    const normalizedTarget = ((270 - targetSegmentCenter) % 360 + 360) % 360;
    const startAngle = rotationAngle % 360;
    let delta = normalizedTarget - startAngle;
    if (delta < 0) delta += 360;
    const totalDistance = 360 * extraSpins + delta;
    const duration = 2800;
    const startTime = performance.now();

    const animateWheel = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startAngle + totalDistance * easeOut;
      setRotationAngle(current);

      if (Math.floor(current / 45) !== Math.floor((current - 15) / 45)) {
        playSoundEffect(350 + (progress * 150));
      }

      if (progress < 1) {
        requestAnimationFrame(animateWheel);
      } else {
        setIsSpinning(false);
        setChosenPrompt(chosen);
        setChosenCategory(`Prompt #${randomIndex + 1} • ${mode === "speaking" ? "Speaking Question" : "Writing Topic"}`);
        playSoundEffect(587, 0.2);
        toast.success(`🎡 Prompt #${randomIndex + 1}: ${chosen.slice(0, 35)}...`, { icon: "🎯" });
      }
    };

    requestAnimationFrame(animateWheel);
  };

  const handleCopyPrompt = () => {
    if (!chosenPrompt) return;
    navigator.clipboard.writeText(chosenPrompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard! 📋");
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSec.toString().padStart(2, "0")}`;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🎡 Speaking & Writing Spin Practice"
      maxWidth="sm:max-w-3xl"
    >
      <div className="space-y-4 -mt-1 text-zinc-900 dark:text-zinc-100">
        {/* Top Segmented Mode Selector: Speaking vs Writing */}
        <div className="grid grid-cols-2 p-1.5 bg-zinc-100 dark:bg-zinc-900/90 rounded-2xl border border-zinc-200 dark:border-zinc-800 gap-1.5">
          <button
            type="button"
            disabled={isSpinning}
            onClick={() => {
              setMode("speaking");
              setChosenPrompt(null);
              setIsTimerRunning(false);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer ${
              mode === "speaking"
                ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-md border border-emerald-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>🎤 Speaking Practice</span>
          </button>

          <button
            type="button"
            disabled={isSpinning}
            onClick={() => {
              setMode("writing");
              setChosenPrompt(null);
              setIsTimerRunning(false);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer ${
              mode === "writing"
                ? "bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-md border border-purple-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <PenTool className="w-4 h-4 shrink-0" />
            <span>✍️ Writing Practice</span>
          </button>
        </div>

        {/* Source Badge & Bank Info */}
        <div className="flex items-center justify-between text-xs px-1 text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {isFromTeacherDb
                ? `Teacher Prompt Bank (${prompts.length} questions available)`
                : `Curated IELTS Bank (${prompts.length} questions available)`}
            </span>
          </div>

          <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            {activePromptList.length} wheel segments
          </span>
        </div>

        {/* Wheel & Action Center */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-purple-500/5 via-transparent to-indigo-500/5 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-500/20 dark:border-purple-500/30 flex flex-col items-center justify-center space-y-4">
          {/* Wheel Visual Container with Marker Pin */}
          <div className="relative flex items-center justify-center">
            {/* Top Pointer Needle */}
            <div className="absolute -top-3 z-20 flex flex-col items-center pointer-events-none">
              <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-t-[18px] border-t-purple-600 dark:border-t-purple-400 drop-shadow-md" />
            </div>

            <canvas
              ref={canvasRef}
              width={220}
              height={220}
              className="rounded-full shadow-lg shadow-purple-500/10 border-4 border-white dark:border-zinc-800"
            />
          </div>

          {/* Spin Trigger Button */}
          <button
            type="button"
            disabled={isSpinning || isLoading}
            onClick={handleSpin}
            className="w-full sm:w-auto px-8 py-3 rounded-2xl font-extrabold text-sm sm:text-base bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 text-white shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2.5 transition cursor-pointer min-h-[46px]"
          >
            {isSpinning ? (
              <>
                <Spinner className="w-5 h-5 text-white" />
                <span>Spinning Wheel...</span>
              </>
            ) : (
              <>
                <Shuffle className="w-5 h-5" />
                <span>🎡 Spin Wheel Now</span>
              </>
            )}
          </button>
        </div>

        {/* Selected Prompt Display Card */}
        {chosenPrompt && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-purple-500/40 shadow-md space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>{chosenCategory || "Selected Topic"}</span>
              </span>

              <button
                type="button"
                onClick={handleCopyPrompt}
                className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy Prompt"}</span>
              </button>
            </div>

            <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white leading-relaxed">
              "{chosenPrompt}"
            </p>

            {/* Practice Companion Tools */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
              {/* Speaking Tool: Practice Timer */}
              {mode === "speaking" && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                        Speaking Response Timer:
                      </span>
                      <span className="font-mono text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatTimer(timerSeconds)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsTimerRunning(!isTimerRunning)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        isTimerRunning
                          ? "bg-rose-500 text-white hover:bg-rose-600"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {isTimerRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isTimerRunning ? "Stop" : "Start 2-min Speech"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTimerRunning(false);
                        setTimerSeconds(0);
                      }}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      title="Reset timer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Writing Tool: Quick Scratchpad */}
              {mode === "writing" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                      📝 Practice Scratchpad &amp; Outline:
                    </span>
                    <span className="font-mono text-[11px]">
                      {scratchpadText.trim() ? scratchpadText.trim().split(/\s+/).length : 0} words
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={scratchpadText}
                    onChange={(e) => setScratchpadText(e.target.value)}
                    placeholder="Jot down your essay thesis statement, body paragraph main points, and vocabulary..."
                    className="input text-xs resize-y w-full leading-relaxed p-2.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border-zinc-200 dark:border-zinc-700"
                  />
                </div>
              )}

              {/* Quick Link to Assignments */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleSpin}
                  className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Spin Again</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate("/student/assignments");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition cursor-pointer"
                >
                  <span>Go to My Assignments</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Bottom Close */}
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>Use this randomizer anytime to practice IELTS Speaking Part 2 and Writing Task 2.</span>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2 rounded-xl cursor-pointer"
          >
            Close Practice
          </button>
        </div>
      </div>
    </Modal>
  );
};

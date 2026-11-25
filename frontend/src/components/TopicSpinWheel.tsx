import React, { useState, useEffect, useRef, useMemo } from "react";
import { Sparkles, RotateCcw, Check, Copy, Mic, PenTool, Shuffle, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { listSpinPrompts } from "@/services/lmsService";

interface TopicSpinWheelProps {
  description?: string;
  assignmentTitle?: string;
  assignmentType?: string; // e.g. "speaking", "writing", or general
  groupId?: string;
  assignmentId?: string;
  onSelectPrompt: (prompt: string, mode: "speaking" | "writing") => void;
  selectedPrompt?: string | null;
}

// Curated bank of high-yield Speaking and Writing prompts (IELTS / CEFR B1-C1)
const DEFAULT_SPEAKING_PROMPTS = [
  "Describe a memorable journey you took with your family or friends. Where did you go and what happened?",
  "Talk about a teacher or mentor who had a strong positive influence on your life. Why do you respect them?",
  "Describe an interesting skill or hobby you would love to learn in the future. How would it help you?",
  "Do you think artificial intelligence will replace human teachers in the future? Explain your viewpoint.",
  "Describe a traditional holiday or celebration in your culture. How do people celebrate it?",
  "Talk about a difficult decision you had to make recently. What was the outcome and what did you learn?",
  "Describe a book, movie, or speech that changed the way you think about the world.",
  "What are the advantages and disadvantages of living in a bustling big city versus a quiet countryside?",
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
];

const SEGMENT_COLORS = [
  "#6366F1", // Indigo
  "#10B981", // Emerald
  "#8B5CF6", // Violet
  "#F59E0B", // Amber
  "#0EA5E9", // Sky
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F43F5E", // Rose
];

export const TopicSpinWheel: React.FC<TopicSpinWheelProps> = ({
  description,
  assignmentTitle = "",
  assignmentType = "general",
  groupId,
  assignmentId,
  onSelectPrompt,
  selectedPrompt: initialPrompt,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [chosenPrompt, setChosenPrompt] = useState<string | null>(initialPrompt || null);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [dbPrompts, setDbPrompts] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Default mode: speaking vs writing based on assignment title or type
  const defaultMode: "speaking" | "writing" = useMemo(() => {
    const t = (assignmentTitle + " " + assignmentType).toLowerCase();
    return (t.includes("speak") || t.includes("voice") || t.includes("oral") || t.includes("pronun")) ? "speaking" : "writing";
  }, [assignmentTitle, assignmentType]);

  const [activeMode, setActiveMode] = useState<"speaking" | "writing">(defaultMode);
  const isSpeaking = activeMode === "speaking";

  // Load teacher-managed prompts from database with automatic fallback
  useEffect(() => {
    listSpinPrompts({
      prompt_type: activeMode,
      group_id: groupId || undefined,
      assignment_id: assignmentId || undefined,
      active_only: true,
      fallback: true,
    })
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setDbPrompts(items.map((i) => i.text));
        } else {
          setDbPrompts([]);
        }
      })
      .catch(() => {
        setDbPrompts([]);
      });
  }, [activeMode, groupId, assignmentId]);

  // Extract prompt candidates from teacher DB first, then description, or fallback to curated prompts
  const prompts = useMemo(() => {
    // 1. Highest priority: Teacher configured prompts from PostgreSQL
    if (dbPrompts.length > 0) {
      return dbPrompts.slice(0, 12);
    }

    // 2. Next: Extracted from assignment description
    const extracted: string[] = [];
    if (description) {
      try {
        const blocks = JSON.parse(description);
        if (Array.isArray(blocks)) {
          blocks.forEach((b: any) => {
            if (b.content && typeof b.content === "string") {
              const lines = b.content.split("\n");
              lines.forEach((l: string) => {
                const clean = l.replace(/^\s*(\d+[\.\)]|[•\-\*]|q\d+:?)\s*/i, "").trim();
                if (clean.length > 20 && (clean.endsWith("?") || clean.endsWith("."))) {
                  extracted.push(clean);
                }
              });
            }
          });
        }
      } catch (e) {
        const lines = description.split("\n");
        lines.forEach((l) => {
          const clean = l.replace(/^\s*(\d+[\.\)]|[•\-\*]|q\d+:?)\s*/i, "").trim();
          if (clean.length > 20 && (clean.endsWith("?") || clean.endsWith(".") || l.match(/^\s*\d+[\.\)]/))) {
            extracted.push(clean);
          }
        });
      }
    }

    if (extracted.length >= 2) {
      return extracted.slice(0, 10);
    }

    // 3. Fallback to standard curated IELTS bank
    return isSpeaking ? DEFAULT_SPEAKING_PROMPTS : DEFAULT_WRITING_PROMPTS;
  }, [dbPrompts, description, isSpeaking]);

  const numSegments = prompts.length;
  const segmentAngle = 360 / numSegments;

  // Draw wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, width, height);

    // Save context for rotation
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationAngle * Math.PI) / 180);

    for (let i = 0; i < numSegments; i++) {
      const startAngle = ((i * segmentAngle) * Math.PI) / 180;
      const endAngle = (((i + 1) * segmentAngle) * Math.PI) / 180;

      // Draw segment slice
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fill();

      // Border between segments
      ctx.strokeStyle = "#0F172A";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw segment label
      ctx.save();
      ctx.rotate(startAngle + (segmentAngle * Math.PI) / 360);
      ctx.textAlign = "right";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 11px sans-serif";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;

      const label = `Prompt #${i + 1}`;
      ctx.fillText(label, radius - 20, 4);
      ctx.restore();
    }

    // Center hub pin
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fillStyle = "#0F172A";
    ctx.fill();
    ctx.strokeStyle = "#6366F1";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }, [rotationAngle, numSegments, segmentAngle]);

  const handleSpin = () => {
    if (isSpinning) return;

    setIsSpinning(true);
    setChosenPrompt(null);

    // Pick random target index
    const targetIndex = Math.floor(Math.random() * numSegments);

    // Calculate final angle so the pointer at 270 deg (top) lands on the target segment
    // Pointer is at the top (angle 270 in canvas standard coordinates)
    const extraRounds = 5 + Math.floor(Math.random() * 3); // 5 to 7 full 360 rotations
    const targetSegmentCenter = targetIndex * segmentAngle + segmentAngle / 2;
    // 270 deg is top pointer
    const finalAngle = extraRounds * 360 + (270 - targetSegmentCenter) + (Math.random() * 10 - 5);

    const startTime = performance.now();
    const duration = 3800; // 3.8s spin
    const startAngle = rotationAngle % 360;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic deceleration curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startAngle + (finalAngle - startAngle) * easeOut;

      setRotationAngle(currentAngle);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        const selected = prompts[targetIndex];
        setChosenPrompt(selected);
        toast.success(`🎯 Topic Selected: Prompt #${targetIndex + 1}!`, {
          id: "topic-selected",
        });
      }
    };

    requestAnimationFrame(animate);
  };

  const handleUsePrompt = () => {
    if (!chosenPrompt) return;
    onSelectPrompt(chosenPrompt, isSpeaking ? "speaking" : "writing");
    toast.success(
      isSpeaking
        ? "🎙️ Topic pinned! Ready to record your speaking response."
        : "✍️ Topic inserted into your essay response!",
      { id: "prompt-applied" }
    );
  };

  const handleCopy = () => {
    if (!chosenPrompt) return;
    navigator.clipboard.writeText(chosenPrompt);
    setCopied(true);
    toast.success("Prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="topic-spin-wheel" className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-purple-950/20 shadow-sm overflow-hidden transition-all scroll-mt-20">
      {/* Header Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between border-b border-indigo-100 dark:border-indigo-900/40 bg-white/60 dark:bg-zinc-900/60 gap-3"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shrink-0">
            🎡
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 flex-wrap">
              <span>{isSpeaking ? "Speaking Question" : "Writing Topic"} Spin Wheel</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono font-semibold">
                {prompts.length} Prompts
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Spin to receive a randomized {isSpeaking ? "cue card / interview question" : "essay prompt"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
          {/* Mode Switcher: Speaking vs Writing */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setActiveMode("speaking");
                setChosenPrompt(null);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                activeMode === "speaking"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Mic className="w-3 h-3" />
              <span>Speaking</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("writing");
                setChosenPrompt(null);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                activeMode === "writing"
                  ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <PenTool className="w-3 h-3" />
              <span>Writing</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
            aria-label="Toggle spin wheel"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
            {/* Wheel Canvas Container */}
            <div className="relative flex flex-col items-center">
              {/* Pointer Indicator Arrow at Top */}
              <div className="absolute -top-3 z-10 w-0 h-0 border-x-8 border-x-transparent border-t-[16px] border-t-rose-500 drop-shadow-md" />

              <canvas
                ref={canvasRef}
                width={220}
                height={220}
                className="rounded-full shadow-lg border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-900"
              />

              <button
                type="button"
                onClick={handleSpin}
                disabled={isSpinning}
                className="mt-3.5 btn-primary text-xs font-bold py-2 px-5 rounded-xl shadow-md flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <Shuffle className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                <span>{isSpinning ? "Spinning..." : "Spin the Wheel!"}</span>
              </button>
            </div>

            {/* Results / Chosen Prompt Box */}
            <div className="w-full sm:max-w-md flex flex-col justify-between space-y-3">
              {chosenPrompt ? (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-white dark:bg-zinc-900 shadow-xs space-y-3 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Selected {isSpeaking ? "Speaking Question" : "Writing Topic"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  <p className="text-sm font-medium text-zinc-900 dark:text-white leading-relaxed">
                    "{chosenPrompt}"
                  </p>

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUsePrompt}
                      className="btn-primary text-xs py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 font-semibold"
                    >
                      {isSpeaking ? <Mic className="w-3.5 h-3.5" /> : <PenTool className="w-3.5 h-3.5" />}
                      <span>{isSpeaking ? "Use for Speaking Recording" : "Insert into My Essay"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSpin}
                      disabled={isSpinning}
                      className="btn-secondary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 text-zinc-600 dark:text-zinc-300"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Re-spin</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 text-center space-y-2">
                  <div className="text-2xl">🎯</div>
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Ready to practice your {isSpeaking ? "Speaking" : "Writing"} skills?
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Click <strong>"Spin the Wheel"</strong> to receive your randomly allocated question or prompt.
                  </p>
                </div>
              )}

              {/* Collapsible Prompt List Overview */}
              <details className="text-xs text-zinc-500 dark:text-zinc-400">
                <summary className="cursor-pointer hover:underline font-medium">
                  View all {prompts.length} available prompts in this wheel
                </summary>
                <div className="mt-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 max-h-36 overflow-y-auto space-y-1.5">
                  {prompts.map((p, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setChosenPrompt(p);
                        toast.success(`Selected Prompt #${idx + 1}`);
                      }}
                      className={`p-1.5 rounded cursor-pointer transition flex items-start gap-1.5 text-[11px] ${
                        chosenPrompt === p
                          ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-semibold"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span className="font-mono font-bold shrink-0">#{idx + 1}:</span>
                      <span className="truncate">{p}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

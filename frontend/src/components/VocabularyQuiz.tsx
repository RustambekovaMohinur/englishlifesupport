import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  HelpCircle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { WordlistItem, QuizAttempt } from "@/types";
import { submitWordlistQuiz } from "@/services/lmsService";
import toast from "react-hot-toast";

interface VocabularyQuizProps {
  setId: string;
  title: string;
  items: WordlistItem[];
  onFinish?: (attempt: QuizAttempt) => void;
  onExit?: () => void;
}

type QuizMode = "en_to_uz" | "uz_to_en" | "mixed";

interface QuizQuestion {
  item: WordlistItem;
  prompt: string;
  promptType: "en" | "uz";
  correctAnswer: string;
  options: string[];
}

export function VocabularyQuiz({ setId, title, items, onFinish, onExit }: VocabularyQuizProps) {
  // Setup mode
  const [mode, setMode] = useState<QuizMode>("mixed");
  const [hasStarted, setHasStarted] = useState(false);

  // Active quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectItems, setIncorrectItems] = useState<WordlistItem[]>([]);

  // Telemetry & anti-cheat
  const [timeSpent, setTimeSpent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [terminatedEarly, setTerminatedEarly] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<QuizAttempt | null>(null);

  // Audio trigger
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);

  const timerRef = useRef<any>(null);

  // Shuffle utility
  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  // Build questions list
  const buildQuestions = useCallback(
    (targetItems: WordlistItem[], selectedMode: QuizMode): QuizQuestion[] => {
      if (targetItems.length < 2) return [];

      const validItems = targetItems.filter((i) => i.word && (i.definition || i.word));
      const pool = validItems;

      return shuffle(validItems).map((item) => {
        // Determine prompt type based on mode
        let pType: "en" | "uz" = "en";
        if (selectedMode === "uz_to_en") pType = "uz";
        else if (selectedMode === "en_to_uz") pType = "en";
        else pType = Math.random() > 0.5 ? "en" : "uz";

        const prompt = pType === "en" ? item.word : (item.definition || item.word);
        const correctAnswer = pType === "en" ? (item.definition || item.word) : item.word;

        // Distractors sampled from other words in the same set
        const otherChoices = pool
          .filter((x) => x.word !== item.word)
          .map((x) => (pType === "en" ? (x.definition || x.word) : x.word))
          .filter((val) => val !== correctAnswer);

        const chosenDistractors = shuffle(Array.from(new Set(otherChoices))).slice(0, 3);
        const allOptions = shuffle([correctAnswer, ...chosenDistractors]);

        return {
          item,
          prompt,
          promptType: pType,
          correctAnswer,
          options: allOptions,
        };
      });
    },
    []
  );

  // Start quiz
  const handleStartQuiz = (activeMode: QuizMode, customItems?: WordlistItem[]) => {
    const list = customItems || items;
    if (list.length < 2) {
      toast.error("This set needs at least 2 words with definitions to generate a quiz.");
      return;
    }
    const qList = buildQuestions(list, activeMode);
    setQuestions(qList);
    setMode(activeMode);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setCorrectCount(0);
    setIncorrectItems([]);
    setTimeSpent(0);
    setTerminatedEarly(false);
    setIsFinished(false);
    setHasStarted(true);
  };

  // Stopwatch timer
  useEffect(() => {
    if (hasStarted && !isFinished && !terminatedEarly) {
      timerRef.current = setInterval(() => {
        setTimeSpent((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasStarted, isFinished, terminatedEarly]);

  // Anti-Cheat: Tab switching lock
  useEffect(() => {
    if (!hasStarted || isFinished || terminatedEarly) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleAntiCheatTrigger("Tab switching or browser minimization detected!");
      }
    };

    const handleWindowBlur = () => {
      handleAntiCheatTrigger("Window lost focus or application switched!");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [hasStarted, isFinished, terminatedEarly, correctCount, currentIndex, questions.length]);

  const handleAntiCheatTrigger = async (reason: string) => {
    if (terminatedEarly || isFinished) return;
    setTerminatedEarly(true);
    setIsFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);

    toast.error(`⚠️ Anti-Cheat Warning: ${reason} Your test has been terminated.`, {
      duration: 6000,
    });

    // Auto-submit early termination telemetry
    try {
      const attempt = await submitWordlistQuiz(setId, {
        mode,
        total_questions: questions.length,
        correct_answers: correctCount,
        time_spent_seconds: timeSpent,
        terminated_early: true,
        anti_cheat_triggered: true,
        incorrect_word_ids: incorrectItems.map((i) => i.id || i.word),
      });
      setLastAttempt(attempt);
      if (onFinish) onFinish(attempt);
    } catch {
      // safe fallback
    }
  };

  const handleSelectOption = (opt: string) => {
    if (isAnswerChecked) return;
    setSelectedOption(opt);
  };

  const handleCheckAnswer = () => {
    if (!selectedOption || isAnswerChecked) return;
    setIsAnswerChecked(true);

    const q = questions[currentIndex];
    const isCorrect = selectedOption === q.correctAnswer;
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setIncorrectItems((prev) => [...prev, q.item]);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
    } else {
      // Finish test
      handleCompleteQuiz();
    }
  };

  const handleCompleteQuiz = async () => {
    setIsFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);

    setIsSubmitting(true);
    try {
      const attempt = await submitWordlistQuiz(setId, {
        mode,
        total_questions: questions.length,
        correct_answers: correctCount,
        time_spent_seconds: timeSpent,
        terminated_early: false,
        anti_cheat_triggered: false,
        incorrect_word_ids: incorrectItems.map((i) => i.id || i.word),
      });
      setLastAttempt(attempt);
      if (onFinish) onFinish(attempt);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save quiz results.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const playWordAudio = (text: string) => {
    setPlayingAudio(text);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      u.onend = () => setPlayingAudio(null);
      u.onerror = () => setPlayingAudio(null);
      window.speechSynthesis.speak(u);
    } else {
      setPlayingAudio(null);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  // =========================================================================
  // VIEW 1: PRE-QUIZ MODE SELECTION & RULES
  // =========================================================================
  if (!hasStarted) {
    return (
      <div className="max-w-xl mx-auto w-full space-y-6 select-none p-2 sm:p-4">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 mb-1">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
            Vocabulary Mastery Quiz
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            {title} ({items.length} vocabulary words)
          </p>
        </div>

        {/* Anti-cheat Policy Box */}
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs sm:text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Anti-Cheat Guard Policy</span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Tab switching, minimizing the browser, or switching applications is <strong>strictly prohibited</strong> during the quiz. Doing so will immediately terminate and record your test.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Select Testing Mode:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setMode("en_to_uz")}
              className={`p-3.5 rounded-xl border text-left transition ${
                mode === "en_to_uz"
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 shadow-xs"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
              }`}
            >
              <span className="font-bold text-xs block">English ➔ Uzbek</span>
              <span className="text-[11px] text-zinc-400">Read word, choose meaning</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("uz_to_en")}
              className={`p-3.5 rounded-xl border text-left transition ${
                mode === "uz_to_en"
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 shadow-xs"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
              }`}
            >
              <span className="font-bold text-xs block">Uzbek ➔ English</span>
              <span className="text-[11px] text-zinc-400">Read meaning, choose word</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("mixed")}
              className={`p-3.5 rounded-xl border text-left transition ${
                mode === "mixed"
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 shadow-xs"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
              }`}
            >
              <span className="font-bold text-xs block">Mixed All</span>
              <span className="text-[11px] text-zinc-400">Randomized bilingual quiz</span>
            </button>
          </div>
        </div>

        {/* Start Button */}
        <div className="pt-2 flex items-center justify-between gap-3">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="btn-secondary text-xs"
            >
              Back to Sets
            </button>
          )}

          <button
            type="button"
            onClick={() => handleStartQuiz(mode)}
            className="flex-1 btn-primary text-xs py-3"
          >
            <span>Start Timed Quiz</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: QUIZ COMPLETED OR TERMINATED
  // =========================================================================
  if (isFinished) {
    const totalQ = questions.length;
    const scorePct = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
    const isMastered = scorePct === 100 && !terminatedEarly;

    return (
      <div className="max-w-md mx-auto w-full space-y-6 select-none p-4 text-center">
        <div className="space-y-3">
          {terminatedEarly ? (
            <div className="inline-flex p-4 rounded-3xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
              <AlertTriangle className="w-12 h-12" />
            </div>
          ) : isMastered ? (
            <div className="inline-flex p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 border border-amber-200 dark:border-amber-800/60 animate-bounce">
              <Trophy className="w-12 h-12" />
            </div>
          ) : (
            <div className="inline-flex p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
              <RotateCcw className="w-12 h-12" />
            </div>
          )}

          <h2 className="text-2xl font-black text-zinc-900 dark:text-white">
            {terminatedEarly
              ? "Test Terminated Early"
              : isMastered
              ? "100% Mastery Achieved! ⭐"
              : "Incomplete / Needs 100% Mastery"}
          </h2>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {terminatedEarly
              ? "Your test was submitted prematurely due to tab-switching."
              : isMastered
              ? "Outstanding! You scored 100% and mastered this vocabulary deck."
              : "Mastery requires 100% score. Retake incorrect words to reach mastery."}
          </p>
        </div>

        {/* Score & Time Summary Box */}
        <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-700/60">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Score
            </span>
            <span
              className={`text-2xl font-black font-mono ${
                isMastered
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-800 dark:text-zinc-200"
              }`}
            >
              {scorePct}%
            </span>
            <span className="text-[11px] text-zinc-400 block">
              ({correctCount} / {totalQ} correct)
            </span>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Time Spent
            </span>
            <span className="text-2xl font-black font-mono text-brand-600 dark:text-brand-400">
              {formatTime(timeSpent)}
            </span>
            <span className="text-[11px] text-zinc-400 block">forward stopwatch</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {!isMastered && incorrectItems.length > 0 && (
            <button
              type="button"
              onClick={() => handleStartQuiz(mode, incorrectItems)}
              className="w-full btn-primary py-3 text-xs"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retake Incorrect Words ({incorrectItems.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleStartQuiz(mode)}
            className="w-full btn-secondary py-3 text-xs"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Retake Full Quiz</span>
          </button>

          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="w-full py-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition"
            >
              Exit to Vocabulary Decks
            </button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: LIVE ACTIVE QUESTION SCREEN
  // =========================================================================
  const currentQ = questions[currentIndex];
  if (!currentQ) return null;

  return (
    <div className="max-w-xl mx-auto w-full space-y-6 select-none p-2 sm:p-4">
      {/* Top Header: Counter, Anti-cheat badge & Stopwatch */}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 border border-brand-200/50 dark:border-brand-800/50">
            Q {currentIndex + 1} / {questions.length}
          </span>
          <span className="text-xs text-zinc-400 hidden sm:inline">
            ({correctCount} correct)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200/50">
            <ShieldAlert className="w-3 h-3" />
            <span>No Tab Switch</span>
          </span>

          <div className="flex items-center gap-1 text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{formatTime(timeSpent)}</span>
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="card p-6 sm:p-8 text-center space-y-4 bg-gradient-to-b from-white via-white to-zinc-50/60 dark:from-[#161B22] dark:via-[#161B22] dark:to-[#111827] border border-zinc-200/80 dark:border-zinc-800 shadow-md">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {currentQ.promptType === "en"
            ? "Choose the Uzbek translation for:"
            : "Choose the English word for:"}
        </span>

        <div className="flex items-center justify-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
            {currentQ.prompt}
          </h1>

          {currentQ.promptType === "en" && (
            <button
              type="button"
              onClick={() => playWordAudio(currentQ.prompt)}
              className="p-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition"
              title="Listen Pronunciation"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {currentQ.item.part_of_speech && (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-serif italic text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40">
            ({currentQ.item.part_of_speech})
          </span>
        )}
      </div>

      {/* Multiple Choice Options (A, B, C, D) */}
      <div className="grid grid-cols-1 gap-2.5">
        {currentQ.options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A, B, C, D
          const isSelected = selectedOption === opt;
          const isCorrect = opt === currentQ.correctAnswer;

          let btnStyles =
            "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] text-zinc-800 dark:text-zinc-200 hover:border-brand-400";
          if (isAnswerChecked) {
            if (isCorrect) {
              btnStyles =
                "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold shadow-xs";
            } else if (isSelected && !isCorrect) {
              btnStyles =
                "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 shadow-xs";
            } else {
              btnStyles = "opacity-40 border-zinc-200 dark:border-zinc-800";
            }
          } else if (isSelected) {
            btnStyles =
              "border-brand-600 bg-brand-50/50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/20";
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectOption(opt)}
              disabled={isAnswerChecked}
              className={`w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border text-left transition-all text-xs sm:text-sm font-medium active:scale-[0.99] ${btnStyles}`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg font-mono font-bold text-xs flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                  {letter}
                </span>
                <span>{opt}</span>
              </div>

              {isAnswerChecked && isCorrect && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              {isAnswerChecked && isSelected && !isCorrect && (
                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Action Controls */}
      <div className="pt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">
          {currentIndex + 1} of {questions.length} questions
        </span>

        {!isAnswerChecked ? (
          <button
            type="button"
            onClick={handleCheckAnswer}
            disabled={!selectedOption}
            className="btn-primary py-2.5 px-6 text-xs"
          >
            Check Answer
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNextQuestion}
            className="btn-primary py-2.5 px-6 text-xs"
          >
            <span>{currentIndex < questions.length - 1 ? "Next Question" : "View Results"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

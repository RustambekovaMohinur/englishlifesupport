import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Volume2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Sparkles,
  Layers,
  HelpCircle,
} from "lucide-react";
import { WordlistItem } from "@/types";

interface FlashcardDeckProps {
  items?: WordlistItem[] | any;
  title?: string;
  onClose?: () => void;
}

export function FlashcardDeck({ items, title, onClose }: FlashcardDeckProps) {
  // Defensive extraction: support Array, { words: [...] }, { items: [...] }, or undefined
  const rawCards = useMemo(() => {
    if (Array.isArray(items)) return items;
    if (items && Array.isArray((items as any).words)) return (items as any).words;
    if (items && Array.isArray((items as any).items)) return (items as any).items;
    return [];
  }, [items]);

  // Normalize both flat schemas (term/word, translation/definition, pos/part_of_speech)
  const cards = useMemo(() => {
    return rawCards
      .map((item: any, idx: number) => {
        if (!item || typeof item !== "object") return null;
        const word = (item.term || item.word || "").trim();
        const definition = (item.translation || item.definition || item.custom_translation || "").trim();
        const part_of_speech = (item.pos || item.part_of_speech || "").trim();
        const phonetic = (item.phonetic || "").trim();
        const example = (item.example || "").trim();
        const audio_us_url = item.audio_us_url || null;
        const audio_gb_url = item.audio_gb_url || null;
        const id = item.id || `card-${idx}`;

        return {
          id,
          word: word || definition,
          definition: definition || word,
          part_of_speech,
          phonetic,
          example,
          audio_us_url,
          audio_gb_url,
        };
      })
      .filter((c: any) => Boolean(c && (c.word || c.definition)));
  }, [rawCards]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<"us" | "gb" | null>(null);

  const total = cards.length;
  const currentItem = cards[currentIndex] || cards[0];

  const handleNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, total]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Keyboard navigation: Left/Right arrows and Spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleFlip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlip, handleNext, handlePrev]);

  // Audio playback handler with Web Speech API fallback
  const playPronunciation = (accent: "us" | "gb", e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentItem?.word) return;

    setPlayingAudio(accent);

    const audioUrl = accent === "us" ? currentItem.audio_us_url : currentItem.audio_gb_url;

    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingAudio(null);
      audio.onerror = () => {
        // Fallback to speech synthesis on audio element error
        playSpeechSynthesis(currentItem.word, accent);
      };
      audio.play().catch(() => {
        playSpeechSynthesis(currentItem.word, accent);
      });
    } else {
      playSpeechSynthesis(currentItem.word, accent);
    }
  };

  const playSpeechSynthesis = (text: string, accent: "us" | "gb") => {
    if (!("speechSynthesis" in window)) {
      setPlayingAudio(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = accent === "us" ? "en-US" : "en-GB";
    utterance.rate = 0.9;
    utterance.onend = () => setPlayingAudio(null);
    utterance.onerror = () => setPlayingAudio(null);

    // Try finding a matching native voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) =>
      accent === "us"
        ? v.lang.includes("en-US") || v.lang.includes("en_US")
        : v.lang.includes("en-GB") || v.lang.includes("en_GB")
    );
    if (voice) {
      utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
  };

  if (!cards.length) {
    return (
      <div className="card text-center p-8 sm:p-12 space-y-3 max-w-md mx-auto my-6 border border-zinc-200 dark:border-zinc-800">
        <Layers className="w-10 h-10 text-zinc-400 mx-auto" />
        <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
          No Flashcards in this Deck
        </h3>
        <p className="p-2 text-center text-slate-400 text-xs sm:text-sm">
          No flashcards available in this set.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition"
          >
            Exit Deck
          </button>
        )}
      </div>
    );
  }

  const progressPct = Math.round(((currentIndex + 1) / total) * 100);

  return (
    <div className="flex flex-col items-center max-w-xl mx-auto w-full px-1 sm:px-4 py-2 select-none overflow-x-hidden">
      {/* Deck Header */}
      <div className="w-full flex flex-wrap items-center justify-between mb-3 sm:mb-4 gap-2">
        <div className="min-w-0">
          {title && (
            <h2 className="text-sm sm:text-lg font-bold text-zinc-900 dark:text-white truncate max-w-[220px] sm:max-w-md">
              {title}
            </h2>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded-full border border-brand-200/50 dark:border-brand-800/40">
              {currentIndex + 1} / {total}
            </span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400">({progressPct}% completed)</span>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition flex items-center justify-center shrink-0"
          >
            Exit Deck
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden mb-4 sm:mb-6">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* 3D Flip Card Container */}
      <div
        className="w-full min-h-[320px] h-[340px] sm:h-[380px] perspective-[1200px] cursor-pointer touch-manipulation"
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        aria-label={`Flashcard: ${currentItem.word}. Press Space or click to flip.`}
      >
        <div
          className={`relative w-full h-full duration-500 preserve-3d transition-transform rounded-3xl shadow-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#161B22] ${
            isFlipped ? "rotate-y-180" : ""
          }`}
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* ================= FRONT FACE ================= */}
          <div
            className="absolute inset-0 w-full h-full p-4 sm:p-8 flex flex-col justify-between backface-hidden rounded-3xl overflow-hidden bg-gradient-to-b from-white via-white to-zinc-50/50 dark:from-[#161B22] dark:via-[#161B22] dark:to-[#0F141C]"
            style={{ backfaceVisibility: "hidden" }}
          >
            {/* Top Indicator */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Term</span>
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400">
                {currentIndex + 1} of {total}
              </span>
            </div>

            {/* Center: Word & Part of Speech */}
            <div className="text-center space-y-2 my-auto px-1">
              <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight break-words hyphens-auto leading-tight">
                {currentItem.word}
              </h1>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                {currentItem.part_of_speech && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold font-serif italic bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                    ({currentItem.part_of_speech})
                  </span>
                )}
                {currentItem.phonetic && (
                  <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                    {currentItem.phonetic}
                  </span>
                )}
              </div>

              {/* Audio Pronunciation Controls */}
              <div className="pt-2 sm:pt-3 flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => playPronunciation("us", e)}
                  disabled={playingAudio !== null}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition active:scale-95 shadow-2xs touch-manipulation"
                  title="Listen American pronunciation"
                >
                  <span>🇺🇸</span>
                  <span>US</span>
                  <Volume2 className={`w-3.5 h-3.5 ${playingAudio === "us" ? "animate-pulse text-brand-500" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={(e) => playPronunciation("gb", e)}
                  disabled={playingAudio !== null}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition active:scale-95 shadow-2xs touch-manipulation"
                  title="Listen British pronunciation"
                >
                  <span>🇬🇧</span>
                  <span>GB</span>
                  <Volume2 className={`w-3.5 h-3.5 ${playingAudio === "gb" ? "animate-pulse text-brand-500" : ""}`} />
                </button>
              </div>
            </div>

            {/* Bottom Hint */}
            <div className="text-center">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-500 bg-zinc-100/60 dark:bg-zinc-800/60 px-3 py-1 rounded-full">
                <RotateCw className="w-3 h-3" />
                <span>Tap card or press Space to flip</span>
              </span>
            </div>
          </div>

          {/* ================= BACK FACE ================= */}
          <div
            className="absolute inset-0 w-full h-full p-4 sm:p-8 flex flex-col justify-between backface-hidden rounded-3xl overflow-hidden bg-gradient-to-b from-indigo-50/20 via-white to-zinc-50/50 dark:from-[#1A2234] dark:via-[#161B22] dark:to-[#0F141C]"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            {/* Top Indicator */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Meaning & Example</span>
              </span>
              <span className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[150px]">
                {currentItem.word}
              </span>
            </div>

            {/* Center Content: Definition & Example */}
            <div className="overflow-y-auto space-y-3 sm:space-y-4 my-auto pr-1 max-h-[190px] sm:max-h-[220px]">
              {currentItem.definition ? (
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5 sm:mb-1">
                    Definition:
                  </p>
                  <p className="text-xs sm:text-base font-medium text-zinc-800 dark:text-zinc-100 leading-relaxed break-words">
                    {currentItem.definition}
                  </p>
                </div>
              ) : (
                <p className="text-xs italic text-zinc-400">No definition provided.</p>
              )}

              {currentItem.example && (
                <div className="p-2.5 sm:p-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-700/40">
                  <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">
                    Example:
                  </p>
                  <p className="text-xs sm:text-sm italic text-zinc-600 dark:text-zinc-300 leading-relaxed break-words">
                    "{currentItem.example}"
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Controls on Back Face */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={(e) => playPronunciation("us", e)}
                  disabled={playingAudio !== null}
                  className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition touch-manipulation"
                  title="Pronounce US"
                >
                  <span>🇺🇸 US</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => playPronunciation("gb", e)}
                  disabled={playingAudio !== null}
                  className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition touch-manipulation"
                  title="Pronounce GB"
                >
                  <span>🇬🇧 GB</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleFlip}
                className="inline-flex items-center gap-1 min-h-[34px] text-[11px] sm:text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline"
              >
                <RotateCw className="w-3 h-3" />
                <span>Flip back</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Controls Bar (Thumb-friendly 48px touch targets) */}
      <div className="w-full flex items-center justify-between mt-5 sm:mt-6 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[48px] py-3 px-3 sm:px-4 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold text-xs sm:text-sm transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-xs active:scale-98 touch-manipulation"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <button
          type="button"
          onClick={handleFlip}
          className="inline-flex items-center justify-center gap-1.5 min-h-[48px] py-3 px-3.5 sm:px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold text-xs sm:text-sm transition shadow-xs active:scale-98 touch-manipulation"
          title="Flip Card"
        >
          <RotateCw className="w-4 h-4" />
          <span className="hidden sm:inline">Flip</span>
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={currentIndex === total - 1}
          className="flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[48px] py-3 px-3 sm:px-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs sm:text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-brand-600/20 active:scale-98 touch-manipulation"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Keyboard Shortcuts Guide */}
      <p className="text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-500 text-center mt-3">
        Tip: Use <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-mono">←</kbd> and <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-mono">→</kbd> keys to navigate, and <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-mono">Space</kbd> to flip.
      </p>
    </div>
  );
}

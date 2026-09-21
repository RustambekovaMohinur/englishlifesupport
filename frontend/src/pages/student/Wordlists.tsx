import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
  Loader2,
  ChevronLeft,
  Trophy,
  Clock,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import { listWordlistSets, getWordlistSet } from "@/services/lmsService";
import { WordlistSetBrief, WordlistSetDetail } from "@/types";
import { FlashcardDeck } from "@/components/FlashcardDeck";
import { VocabularyQuiz } from "@/components/VocabularyQuiz";
import { MatchPairsGame } from "@/components/MatchPairsGame";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, LoadingRows } from "@/components/ui";

type StudyMode = "flashcards" | "quiz" | "match";

export default function StudentWordlistsPage() {
  const [sets, setSets] = useState<WordlistSetBrief[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState<WordlistSetDetail | null>(null);
  const [isLoadingDeck, setIsLoadingDeck] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>("flashcards");

  useEffect(() => {
    loadSets();
  }, []);

  const loadSets = () => {
    setIsLoading(true);
    listWordlistSets()
      .then(setSets)
      .catch((err) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load vocabulary decks");
      })
      .finally(() => setIsLoading(false));
  };

  const handleSelectSet = async (setId: string, mode: StudyMode = "flashcards") => {
    setIsLoadingDeck(true);
    setStudyMode(mode);
    try {
      const detail = await getWordlistSet(setId);
      setSelectedSet(detail);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to load flashcard deck");
    } finally {
      setIsLoadingDeck(false);
    }
  };

  const handleExitDeck = () => {
    setSelectedSet(null);
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* If a deck is open, display the interactive Flashcard player / Quiz / Match Game */}
        {selectedSet ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <button
                type="button"
                onClick={handleExitDeck}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition w-fit"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Vocabulary Decks</span>
              </button>

              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => setStudyMode("flashcards")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    studyMode === "flashcards"
                      ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>🎴 Flashcards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudyMode("quiz")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    studyMode === "quiz"
                      ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>📝 Practice Quiz</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudyMode("match")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    studyMode === "match"
                      ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <span>🧩 Match Pairs</span>
                </button>
              </div>
            </div>

            <div className="card p-4 sm:p-8 bg-white dark:bg-[#111827] border border-zinc-200/80 dark:border-zinc-800">
              {studyMode === "flashcards" && (
                <FlashcardDeck
                  items={selectedSet.items}
                  title={selectedSet.title}
                  onClose={handleExitDeck}
                />
              )}
              {studyMode === "quiz" && (
                <VocabularyQuiz
                  setId={selectedSet.id}
                  title={selectedSet.title}
                  items={selectedSet.items}
                  onFinish={() => {
                    loadSets();
                  }}
                  onExit={handleExitDeck}
                />
              )}
              {studyMode === "match" && (
                <MatchPairsGame
                  items={selectedSet.items}
                  title={selectedSet.title}
                  onExit={handleExitDeck}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
                  <span>Vocabulary & Flashcards</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                    Interactive Practice
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Master new words, definitions, and American / British pronunciations using 3D interactive flashcard decks, bilingual quizzes, and matching games.
                </p>
              </div>
            </div>

            {/* Deck List */}
            {isLoading ? (
              <div className="card p-6">
                <LoadingRows rows={4} />
              </div>
            ) : sets.length === 0 ? (
              <EmptyState
                title="No vocabulary decks assigned yet"
                description="Your teacher hasn't published any wordlists for your cohort yet. Check back soon!"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sets.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSet(s.id)}
                    className="card hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2.5 rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 group-hover:scale-110 transition-transform">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition truncate" title={s.title}>
                              {s.title}
                            </h3>
                            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {s.group_name || "General Vocabulary"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.is_mastered && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 flex items-center gap-1">
                              ⭐ Mastered
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                            {s.word_count} words
                          </span>
                        </div>
                      </div>

                      {/* Stats row if attempted */}
                      {(s.best_score != null || s.best_time_seconds != null) && (
                        <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {s.best_score != null && (
                            <span className="inline-flex items-center gap-1">
                              <span>Best Score:</span>
                              <strong className={s.best_score === 100 ? "text-emerald-600 font-bold" : "text-zinc-700 dark:text-zinc-200 font-mono"}>
                                {s.best_score}%
                              </strong>
                            </span>
                          )}
                          {s.best_time_seconds != null && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                              ⏱️ {Math.floor(s.best_time_seconds / 60)}m {s.best_time_seconds % 60}s
                            </span>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-zinc-400 mt-2">
                        Published: {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        <span>Study Deck</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                        <span>🎴 Flashcards</span>
                        <span>•</span>
                        <span>📝 Quiz</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { listWordlistSets, getWordlistSet } from "@/services/lmsService";
import { WordlistSetBrief, WordlistSetDetail } from "@/types";
import { FlashcardDeck } from "@/components/FlashcardDeck";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, LoadingRows } from "@/components/ui";

export default function StudentWordlistsPage() {
  const [sets, setSets] = useState<WordlistSetBrief[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState<WordlistSetDetail | null>(null);
  const [isLoadingDeck, setIsLoadingDeck] = useState(false);

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

  const handleSelectSet = async (setId: string) => {
    setIsLoadingDeck(true);
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
        {/* If a deck is open, display the interactive Flashcard player */}
        {selectedSet ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleExitDeck}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Vocabulary Decks</span>
            </button>

            <div className="card p-4 sm:p-8 bg-white dark:bg-[#111827] border border-zinc-200/80 dark:border-zinc-800">
              <FlashcardDeck
                items={selectedSet.items}
                title={selectedSet.title}
                onClose={handleExitDeck}
              />
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
                  Master new words, definitions, and American / British pronunciations using 3D interactive flashcard decks.
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

                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                          {s.word_count} words
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 mt-3">
                        Published: {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        <span>Study Flashcards</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>

                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        🇺🇸 / 🇬🇧 Audio
                      </span>
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

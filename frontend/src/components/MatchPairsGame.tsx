import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Clock,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  CheckCircle2,
} from "lucide-react";
import { WordlistItem } from "@/types";

interface MatchPairsGameProps {
  items: WordlistItem[];
  title?: string;
  onExit?: () => void;
}

interface MatchCard {
  id: string;
  itemWord: string;
  text: string;
  type: "en" | "uz";
  isMatched: boolean;
}

export function MatchPairsGame({ items, title, onExit }: MatchPairsGameProps) {
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selectedFirst, setSelectedFirst] = useState<MatchCard | null>(null);
  const [selectedSecond, setSelectedSecond] = useState<MatchCard | null>(null);
  const [isMismatch, setIsMismatch] = useState(false);
  const [matchesCount, setMatchesCount] = useState(0);
  const [totalPairs, setTotalPairs] = useState(0);

  // Stopwatch
  const [timeSpent, setTimeSpent] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const timerRef = useRef<any>(null);

  // Initialize Game
  useEffect(() => {
    initGame();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items]);

  const initGame = () => {
    // Select up to 8 pairs for a balanced grid
    const valid = items.filter((i) => i.word && (i.definition || i.word));
    const selectedItems = [...valid].sort(() => Math.random() - 0.5).slice(0, 8);
    setTotalPairs(selectedItems.length);
    setMatchesCount(0);
    setSelectedFirst(null);
    setSelectedSecond(null);
    setIsMismatch(false);
    setTimeSpent(0);
    setIsCompleted(false);

    const cardList: MatchCard[] = [];
    selectedItems.forEach((item, idx) => {
      // English card
      cardList.push({
        id: `en-${item.word}-${idx}`,
        itemWord: item.word,
        text: item.word,
        type: "en",
        isMatched: false,
      });
      // Uzbek definition card
      cardList.push({
        id: `uz-${item.word}-${idx}`,
        itemWord: item.word,
        text: item.definition || item.word,
        type: "uz",
        isMatched: false,
      });
    });

    // Shuffle all cards
    setCards(cardList.sort(() => Math.random() - 0.5));

    // Start timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeSpent((prev) => prev + 1);
    }, 1000);
  };

  const handleCardClick = (card: MatchCard) => {
    if (card.isMatched || isMismatch) return;
    if (selectedFirst && selectedFirst.id === card.id) return;

    if (!selectedFirst) {
      setSelectedFirst(card);
    } else if (!selectedSecond) {
      setSelectedSecond(card);

      // Check match
      const isMatch =
        selectedFirst.itemWord === card.itemWord && selectedFirst.type !== card.type;

      if (isMatch) {
        // Matched!
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.itemWord === card.itemWord ? { ...c, isMatched: true } : c
            )
          );
          setMatchesCount((prev) => {
            const next = prev + 1;
            if (next === totalPairs) {
              handleGameFinished();
            }
            return next;
          });
          setSelectedFirst(null);
          setSelectedSecond(null);
        }, 250);
      } else {
        // Mismatch - shake and reset
        setIsMismatch(true);
        setTimeout(() => {
          setSelectedFirst(null);
          setSelectedSecond(null);
          setIsMismatch(false);
        }, 800);
      }
    }
  };

  const handleGameFinished = () => {
    setIsCompleted(true);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-2xl mx-auto w-full select-none space-y-5 p-2 sm:p-4">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <span>🧩 Match Pairs Game</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              {matchesCount} / {totalPairs} matched
            </span>
          </h2>
          {title && <p className="text-xs text-zinc-400">{title}</p>}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{formatTime(timeSpent)}</span>
          </div>

          <button
            type="button"
            onClick={initGame}
            className="p-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition"
            title="Reset Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Completion Banner */}
      {isCompleted && (
        <div className="card p-6 text-center space-y-3 bg-gradient-to-b from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-[#161B22] border border-emerald-200 dark:border-emerald-800/60 shadow-lg">
          <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300">
            <Trophy className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white">
            All Pairs Matched! 🎉
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            You matched all {totalPairs} vocabulary pairs in{" "}
            <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
              {formatTime(timeSpent)}
            </strong>
            !
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={initGame}
              className="btn-primary py-2 px-5 text-xs"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="btn-secondary py-2 px-5 text-xs"
              >
                Exit Game
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid of Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {cards.map((card) => {
          const isSelected =
            selectedFirst?.id === card.id || selectedSecond?.id === card.id;

          let cardClasses =
            "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#161B22] text-zinc-800 dark:text-zinc-200 hover:border-brand-400 hover:shadow-sm";

          if (card.isMatched) {
            cardClasses =
              "opacity-20 pointer-events-none scale-95 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20";
          } else if (isSelected && isMismatch) {
            cardClasses =
              "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-400/40 animate-shake";
          } else if (isSelected) {
            cardClasses =
              "border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/30 scale-102";
          }

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardClick(card)}
              disabled={card.isMatched}
              className={`h-24 sm:h-28 p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition-all duration-200 ${cardClasses}`}
            >
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-1">
                {card.type === "en" ? "English" : "Uzbek"}
              </span>
              <span
                className={`text-xs sm:text-sm font-semibold leading-tight line-clamp-3 ${
                  card.type === "en" ? "font-bold" : "font-normal"
                }`}
              >
                {card.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

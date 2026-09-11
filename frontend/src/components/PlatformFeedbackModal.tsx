import React, { useState, useEffect } from "react";
import { Star, MessageSquarePlus, X, Check, Loader2, Sparkles, Heart } from "lucide-react";
import toast from "react-hot-toast";
import { submitPlatformFeedback, getPlatformFeedbackSummary } from "@/services/lmsService";
import { useAuth } from "@/hooks/useAuth";

const RATING_LABELS: Record<number, { text: string; emoji: string; color: string }> = {
  1: { text: "Juda yomon — Ko'p xatolar bor", emoji: "😡", color: "text-rose-500" },
  2: { text: "Yaxshi emas — Kamchiliklar ko'p", emoji: "😕", color: "text-orange-500" },
  3: { text: "Qoniqarli — Yaxshilanishi kerak", emoji: "😐", color: "text-amber-500" },
  4: { text: "Yaxshi — Menga yoqdi", emoji: "🙂", color: "text-emerald-500" },
  5: { text: "A'lo darajada — Ajoyib platforma!", emoji: "🤩", color: "text-brand-500 dark:text-brand-400" },
};

interface PlatformFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  onSuccess?: () => void;
}

export function PlatformFeedbackModal({ isOpen, onClose, onSubmitted, onSuccess }: PlatformFeedbackModalProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [whatWorksWell, setWhatWorksWell] = useState("");
  const [whatToImprove, setWhatToImprove] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isExistingReview, setIsExistingReview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInitialLoading(true);
      getPlatformFeedbackSummary()
        .then((summary) => {
          if (summary.user_has_reviewed && summary.user_review) {
            setRating(summary.user_review.rating || 5);
            setWhatWorksWell(summary.user_review.what_works_well || summary.user_review.message || "");
            setWhatToImprove(summary.user_review.what_to_improve || "");
            setIsExistingReview(true);
          }
        })
        .catch(() => null)
        .finally(() => setInitialLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDisplayRating = hoverRating || rating;
  const ratingInfo = RATING_LABELS[currentDisplayRating] || RATING_LABELS[5];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      toast.error("Iltimos, yulduzcha tanlab baho bering.");
      return;
    }

    setLoading(true);
    try {
      await submitPlatformFeedback({
        rating,
        what_works_well: whatWorksWell.trim() || undefined,
        what_to_improve: whatToImprove.trim() || undefined,
        category: "Platform Experience",
        message: whatWorksWell.trim() || whatToImprove.trim() || undefined,
      });

      toast.success(
        user?.role === "student" && !isExistingReview
          ? "🌟 Fikringiz qabul qilindi va +5 XP hisobingizga qo'shildi! Rahmat!"
          : "🌟 Fikringiz uchun katta rahmat! Tizimni yanada yaxshilaymiz!"
      );
      if (onSubmitted) onSubmitted();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Fikrni yuborishda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-black/[0.08] dark:border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0">
              ⭐
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-snug">
                {isExistingReview ? "Fikringizni yangilash" : "Platformani baholash & Fikr"}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                O'quv tizimini yaxshilashga o'z hissangizni qo'shing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {user?.role === "student" && !isExistingReview && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs">
              <Sparkles className="w-4 h-4 shrink-0 text-amber-500 animate-pulse" />
              <span>
                <strong>+5 XP Bonusi:</strong> O'zbekistondagi eng yaxshi LMS bo'lishimiz uchun samimiy fikringiz juda muhim!
              </span>
            </div>
          )}

          {/* Star Selector */}
          <div className="text-center py-2 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">
              Platformadan umumiy mamnunligingizni baholang:
            </label>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const isLit = (hoverRating || rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1.5 transition-transform hover:scale-125 active:scale-95 focus:outline-hidden"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        isLit
                          ? "fill-amber-400 text-amber-400 drop-shadow-sm"
                          : "text-zinc-300 dark:text-zinc-700"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[20px]">
              <span>{ratingInfo.emoji}</span>
              <span className={ratingInfo.color}>{ratingInfo.text}</span>
            </div>
          </div>

          {/* Section 1: What works well */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              💚 Saytda sizga eng yoqqan qulayliklar nima? <span className="text-zinc-400 font-normal">(ixtiyoriy)</span>
            </label>
            <textarea
              value={whatWorksWell}
              onChange={(e) => setWhatWorksWell(e.target.value)}
              rows={3}
              placeholder="Masalan: dizayn, audio yozish va eshitish qulayligi, topshiriqlarni tez yuklash, reyting jadvali..."
              className="w-full text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-hidden transition resize-none"
              maxLength={2000}
            />
          </div>

          {/* Section 2: What to improve */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              🔧 Qanday kamchiliklar bor yoki nimani yaxshilash kerak? <span className="text-zinc-400 font-normal">(ixtiyoriy)</span>
            </label>
            <textarea
              value={whatToImprove}
              onChange={(e) => setWhatToImprove(e.target.value)}
              rows={3}
              placeholder="Masalan: sayt tezligi, mobil telefonda qulaylik, tushunarsiz tugmalar yoki yangi funksiyalar..."
              className="w-full text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-hidden transition resize-none"
              maxLength={2000}
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || initialLoading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Yuborilmoqda...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{isExistingReview ? "Yangilash" : "Yuborish"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PlatformFeedbackFloatingTrigger() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-16 lg:bottom-6 right-4 lg:right-6 z-40 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-lg shadow-amber-500/25 transition-all hover:scale-105 active:scale-95 group"
        title="Platformani baholash va fikr bildirish"
      >
        <Star className="w-3.5 h-3.5 fill-white transition-transform group-hover:rotate-12" />
        <span className="hidden sm:inline">Baholash & Fikr</span>
        <span className="sm:hidden">Fikr</span>
      </button>

      <PlatformFeedbackModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

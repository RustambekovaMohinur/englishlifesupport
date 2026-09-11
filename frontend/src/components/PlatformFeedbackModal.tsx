import React, { useState, useEffect } from "react";
import { Star, MessageSquarePlus, MessageSquare, X, Check, Loader2, Sparkles, Heart, Send } from "lucide-react";
import toast from "react-hot-toast";
import {
  submitPlatformFeedback,
  getPlatformFeedbackSummary,
  toggleFeedbackLike,
  addFeedbackReply,
} from "@/services/lmsService";
import { PublicFeedbackItem, FeedbackReplyItem } from "@/types";
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

/**
 * Individual Feedback Review Card with Like and Threaded Replies
 */
function FeedbackReviewCard({
  item,
}: {
  item: PublicFeedbackItem;
}) {
  const [likesCount, setLikesCount] = useState<number>(item.likes_count ?? 0);
  const [hasLiked, setHasLiked] = useState<boolean>(item.has_liked ?? false);
  const [isLiking, setIsLiking] = useState(false);

  const [replies, setReplies] = useState<FeedbackReplyItem[]>(item.replies ?? []);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  async function handleToggleLike() {
    if (isLiking) return;
    const prevLiked = hasLiked;
    const prevCount = likesCount;

    // Optimistic update
    setHasLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    setIsLiking(true);

    try {
      const res = await toggleFeedbackLike(item.id);
      setHasLiked(res.liked);
      setLikesCount(res.likes_count);
    } catch {
      // Revert upon failure
      setHasLiked(prevLiked);
      setLikesCount(prevCount);
      toast.error("Like amali bajarilmadi");
    } finally {
      setIsLiking(false);
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    const clean = replyText.trim();
    if (!clean) return;

    setIsSubmittingReply(true);
    try {
      const newReply = await addFeedbackReply(item.id, clean);
      setReplies((prev) => [...prev, newReply]);
      setReplyText("");
      setShowReplies(true);
      toast.success("Javobingiz qo'shildi!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Javob yuborishda xatolik");
    } finally {
      setIsSubmittingReply(false);
    }
  }

  return (
    <div
      className={`p-4 rounded-2xl bg-white dark:bg-[#111827] border shadow-xs space-y-3 flex flex-col justify-between transition ${
        item.is_mine
          ? "border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10"
          : "border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
            {item.author_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                {item.author_name}
              </p>
              {item.is_mine && (
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  Siz
                </span>
              )}
            </div>
            {item.created_at && (
              <p className="text-[10px] text-zinc-400 font-mono">
                {new Date(item.created_at).toLocaleDateString("uz-UZ", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        {/* Stars Badge */}
        <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 text-amber-500 shrink-0">
          {"★".repeat(item.rating)}
          <span className="text-zinc-300 dark:text-zinc-700">
            {"★".repeat(Math.max(0, 5 - item.rating))}
          </span>
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 ml-1 font-mono">
            {item.rating}/5
          </span>
        </div>
      </div>

      {/* Feedback Content */}
      <div className="space-y-2 flex-1 text-xs">
        {item.what_works_well && (
          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
            <p className="font-bold text-emerald-800 dark:text-emerald-300 text-[11px] mb-0.5 flex items-center gap-1">
              <span>💚</span> <span>Yoqqan jihatlari:</span>
            </p>
            <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {item.what_works_well}
            </p>
          </div>
        )}

        {item.what_to_improve && (
          <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50">
            <p className="font-bold text-amber-800 dark:text-amber-300 text-[11px] mb-0.5 flex items-center gap-1">
              <span>🔧</span> <span>Taklif va yaxshilanishlar:</span>
            </p>
            <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {item.what_to_improve}
            </p>
          </div>
        )}

        {!item.what_works_well && !item.what_to_improve && item.message && (
          <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {item.message}
            </p>
          </div>
        )}
      </div>

      {/* Action Bar: Like & Reply Toggle */}
      <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {/* Like Button */}
          <button
            type="button"
            onClick={handleToggleLike}
            disabled={isLiking}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition active:scale-95 font-medium ${
              hasLiked
                ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-semibold"
                : "bg-zinc-100/70 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 transition-transform ${
                hasLiked ? "fill-rose-500 text-rose-500 scale-110" : ""
              }`}
            />
            <span className="tabular-nums font-mono">{likesCount}</span>
          </button>

          {/* Reply Button */}
          <button
            type="button"
            onClick={() => setShowReplies(!showReplies)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition font-medium ${
              showReplies
                ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 font-semibold"
                : "bg-zinc-100/70 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              {replies.length > 0 ? `${replies.length} ta javob` : "Javob berish"}
            </span>
          </button>
        </div>
      </div>

      {/* Threaded Replies Section (Collapsible) */}
      {showReplies && (
        <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.06] space-y-2.5 animate-in fade-in duration-150">
          {/* List of Replies */}
          {replies.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {replies.map((r) => {
                const isTeacher =
                  r.author_role === "teacher" ||
                  r.author_role === "admin" ||
                  r.author_role === "superadmin";

                return (
                  <div
                    key={r.id}
                    className={`p-2.5 rounded-xl text-xs space-y-1 ${
                      isTeacher
                        ? "bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60"
                        : "bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-zinc-900 dark:text-white truncate">
                          {r.author_name}
                        </span>
                        {isTeacher && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-600 text-white shadow-xs shrink-0">
                            Ustoz / O'qituvchi
                          </span>
                        )}
                        {r.is_mine && !isTeacher && (
                          <span className="text-[9px] font-semibold px-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                            Siz
                          </span>
                        )}
                      </div>
                      {r.created_at && (
                        <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                          {new Date(r.created_at).toLocaleTimeString("uz-UZ", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {r.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* New Reply Input Form */}
          <form onSubmit={handleSendReply} className="flex items-center gap-1.5">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Fikringiz yoki javobingizni yozing..."
              className="flex-1 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-hidden transition"
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={isSubmittingReply || !replyText.trim()}
              className="p-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 transition shrink-0 active:scale-95"
              title="Yuborish"
            >
              {isSubmittingReply ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Public Community Reviews Wall / Feed
 * Accessible to students and teachers for full transparency.
 */
export function PublicCommunityReviewsWall({
  feedbacks,
  isLoading,
  onOpenFeedbackModal,
  userHasReviewed,
}: {
  feedbacks: PublicFeedbackItem[];
  isLoading?: boolean;
  onOpenFeedbackModal?: () => void;
  userHasReviewed?: boolean;
}) {
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const filteredFeedbacks = ratingFilter
    ? feedbacks.filter((f) => f.rating === ratingFilter)
    : feedbacks;

  const avgRating =
    feedbacks.length > 0
      ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)
      : "5.0";

  return (
    <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0">
            💬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight">
                O'quvchilar Fikrlari & Sharhlar
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ⭐ {avgRating} / 5.0
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Platforma sifatini oshirish bo'yicha jamoamiz a'zolarining ochiq fikrlari
            </p>
          </div>
        </div>

        {onOpenFeedbackModal && (
          <button
            type="button"
            onClick={onOpenFeedbackModal}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-xs transition shrink-0 self-start sm:self-auto"
          >
            <span>{userHasReviewed ? "Fikrimni yangilash" : "⭐ Fikr bildirish (+5 XP)"}</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setRatingFilter(null)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition shrink-0 ${
            ratingFilter === null
              ? "bg-brand-600 text-white shadow-xs"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          Barchasi ({feedbacks.length})
        </button>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = feedbacks.filter((f) => f.rating === star).length;
          return (
            <button
              key={star}
              type="button"
              onClick={() => setRatingFilter(ratingFilter === star ? null : star)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 flex items-center gap-1 ${
                ratingFilter === star
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              <span>{star} ★</span>
              <span className="opacity-70 text-[10px]">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Reviews Cards Grid */}
      {isLoading ? (
        <div className="py-8 text-center text-xs text-zinc-400">Sharhlar yuklanmoqda...</div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="text-center py-8 px-4 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            {ratingFilter ? `${ratingFilter} yulduzli sharhlar topilmadi` : "Hozircha sharhlar mavjud emas"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {filteredFeedbacks.map((item) => (
            <FeedbackReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// Named alias export for compatibility
export { PlatformFeedbackModal as FeedbackModal };



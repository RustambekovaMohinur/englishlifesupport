import { useState } from "react";
import { Star, X, Sparkles, Send, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { submitPlatformFeedback } from "@/services/lmsService";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  "Platform Experience",
  "Voice & Audio Recording",
  "Homework & Submissions",
  "Vocabulary Practice",
  "Feature Request",
  "Bug Report",
];

export function PlatformFeedbackModal({ isOpen, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("Platform Experience");
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedReward, setSubmittedReward] = useState<boolean>(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 5) {
      toast.error("Please provide at least 5 characters of feedback.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitPlatformFeedback(rating, category, message.trim());
      setSubmittedReward(true);
      toast.success("Thank you for your feedback! +5 XP awarded 🎉");
      setTimeout(() => {
        setSubmittedReward(false);
        setMessage("");
        setRating(5);
        if (onSuccess) onSuccess();
        onClose();
      }, 1600);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#161B22] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center text-base">
              ✨
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                Share Platform Feedback
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Help us improve English Life & earn <span className="font-semibold text-brand-600 dark:text-brand-400">+5 XP</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content / Form */}
        {submittedReward ? (
          <div className="p-8 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center text-3xl animate-bounce">
              🌟
            </div>
            <h4 className="text-base font-bold text-zinc-900 dark:text-white">
              Feedback Received!
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Your voice helps shape English Life. +5 XP has been added to your profile!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Star Rating */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                How is your overall experience?
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = (hoverRating !== null ? hoverRating : rating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      onClick={() => setRating(star)}
                      className="p-1 text-zinc-300 dark:text-zinc-700 hover:scale-110 transition-transform focus:outline-hidden"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          filled
                            ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                            : "text-zinc-300 dark:text-zinc-600"
                        } transition-colors`}
                      />
                    </button>
                  );
                })}
                <span className="ml-2 text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                  {hoverRating !== null ? hoverRating : rating}/5
                </span>
              </div>
            </div>

            {/* Category Chips */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      category === cat
                        ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Your Review & Suggestions
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What do you love? What can we improve? (Minimum 5 characters)"
                rows={4}
                className="w-full input text-xs resize-none py-2 leading-relaxed"
                required
              />
              <div className="flex justify-between items-center mt-1 text-[10px] text-zinc-400">
                <span>Constructive feedback makes English Life better for everyone</span>
                <span className="font-mono">{message.length}/2000</span>
              </div>
            </div>

            {/* Submit CTA */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-xs px-3.5 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || message.trim().length < 5}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Submit Review (+5 XP)
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

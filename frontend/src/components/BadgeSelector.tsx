import { FC, useState } from "react";
import toast from "react-hot-toast";

import { updatePremiumPreferences } from "@/services/lmsService";

interface BadgeOption {
  badge: string;
  name: string;
  description: string;
}

const BADGES: BadgeOption[] = [
  { badge: "⭐", name: "Star", description: "Dedicated Learner" },
  { badge: "👑", name: "Crown", description: "Royal Achiever" },
  { badge: "🔥", name: "Fire", description: "Elite Streak & Passion" },
  { badge: "💎", name: "Diamond", description: "Diamond Grade" },
  { badge: "🕊️", name: "Dove", description: "Serene Mastery" },
];

interface Props {
  currentBadge: string | null;
  currentPlan?: string;
  onBadgeUpdated: (newBadge: string | null) => void;
}

export const BadgeSelector: FC<Props> = ({ currentBadge, onBadgeUpdated }) => {
  const [updating, setUpdating] = useState(false);

  const handleSelectBadge = async (badge: string | null) => {
    setUpdating(true);
    try {
      await updatePremiumPreferences({ custom_badge: badge || "" });
      onBadgeUpdated(badge);
      toast.success(badge ? `Badge updated to ${badge}!` : "Badge cleared.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update badge");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          <span>✨</span>
          <span>Profile Badge & Emoji Stickers</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            All Free & Unlocked ✨
          </span>
        </h3>

        {currentBadge && (
          <button
            onClick={() => handleSelectBadge(null)}
            disabled={updating}
            className="text-xs text-zinc-400 hover:text-rose-500 transition cursor-pointer"
          >
            Clear Badge
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {BADGES.map((item) => {
          const active = currentBadge === item.badge;

          return (
            <button
              key={item.badge}
              onClick={() => handleSelectBadge(item.badge)}
              disabled={updating}
              className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer ${
                active
                  ? "border-purple-500 bg-purple-500/10 shadow-xs"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-purple-400 bg-white dark:bg-zinc-900"
              }`}
            >
              <span className="text-2xl mb-1 select-none">{item.badge}</span>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {item.name}
              </span>
              <span className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-full">
                {item.description}
              </span>

              {active && (
                <div className="absolute top-1.5 left-1.5 text-purple-600 dark:text-purple-400 text-xs font-bold">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BadgeSelector;

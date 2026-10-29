import { FC, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { updatePremiumPreferences } from "@/services/lmsService";

interface BadgeOption {
  badge: string;
  name: string;
  minPlan: "standard" | "pro_vip";
  description: string;
}

const BADGES: BadgeOption[] = [
  { badge: "⭐", name: "Star", minPlan: "standard", description: "Standard Learner emblem" },
  { badge: "👑", name: "Crown", minPlan: "pro_vip", description: "Pro VIP Royal emblem" },
  { badge: "🔥", name: "Fire", minPlan: "pro_vip", description: "Elite Streak & Passion" },
  { badge: "💎", name: "Diamond", minPlan: "pro_vip", description: "Diamond Grade Achiever" },
  { badge: "🕊️", name: "Dove", minPlan: "pro_vip", description: "Serene Mastery" },
];

interface Props {
  currentBadge: string | null;
  currentPlan: string;
  onBadgeUpdated: (newBadge: string | null) => void;
}

export const BadgeSelector: FC<Props> = ({ currentBadge, currentPlan, onBadgeUpdated }) => {
  const [updating, setUpdating] = useState(false);

  const isUnlocked = (minPlan: "standard" | "pro_vip") => {
    if (currentPlan === "pro_vip") return true;
    if (currentPlan === "standard" && minPlan === "standard") return true;
    return false;
  };

  const handleSelectBadge = async (badge: string | null, unlocked: boolean, minPlan: "standard" | "pro_vip") => {
    if (badge && !unlocked) {
      if (minPlan === "pro_vip") {
        toast.error("👑 This elite badge requires the Pro VIP (29,000 UZS) plan!");
      } else {
        toast.error("⭐ Custom badges require the Standard (19,000 UZS) plan!");
      }
      return;
    }

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
          {currentPlan !== "free" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 capitalize">
              {currentPlan.replace("_", " ")}
            </span>
          )}
        </h3>

        {currentBadge && (
          <button
            onClick={() => handleSelectBadge(null, true, "standard")}
            disabled={updating}
            className="text-xs text-zinc-400 hover:text-rose-500 transition cursor-pointer"
          >
            Clear Badge
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {BADGES.map((item) => {
          const unlocked = isUnlocked(item.minPlan);
          const active = currentBadge === item.badge;

          return (
            <button
              key={item.badge}
              onClick={() => handleSelectBadge(item.badge, unlocked, item.minPlan)}
              disabled={updating}
              className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer ${
                active
                  ? "border-purple-500 bg-purple-500/10 shadow-xs"
                  : unlocked
                  ? "border-zinc-200 dark:border-zinc-800 hover:border-purple-400 bg-white dark:bg-zinc-900"
                  : "border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/40 opacity-70 cursor-not-allowed"
              }`}
            >
              <span className="text-2xl mb-1 select-none">{item.badge}</span>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {item.name}
              </span>
              <span
                className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
                  item.minPlan === "pro_vip" ? "text-amber-500" : "text-blue-500"
                }`}
              >
                {item.minPlan === "pro_vip" ? "Pro VIP" : "Standard"}
              </span>

              {!unlocked && (
                <div className="absolute top-1.5 right-1.5 text-zinc-400">
                  <Lock size={12} />
                </div>
              )}

              {active && (
                <div className="absolute top-1.5 left-1.5 text-purple-600 dark:text-purple-400 text-xs font-bold">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {currentPlan === "free" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          🔒 Unlock ⭐ Star badge with <b>Standard (19k)</b> or 👑 🔥 💎 badges with <b>Pro VIP (29k)</b>.
        </p>
      )}
      {currentPlan === "standard" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          ⭐ Standard unlocks Star. Upgrade to <b>Pro VIP (29k)</b> for Crown 👑, Fire 🔥, Diamond 💎, and Dove 🕊️.
        </p>
      )}
    </div>
  );
};

export default BadgeSelector;

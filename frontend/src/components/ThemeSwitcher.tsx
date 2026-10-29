/**
 * ThemeSwitcher – UI panel shown in the student Profile page.
 * All 6 themes: Light, Dark, Cyber Purple, Neon Pink, Emerald Green, Golden Sunset.
 * Fully responsive across mobile, tablet, and desktop screens.
 */
import { FC } from "react";
import { Lock, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { ThemeId, useTheme } from "@/contexts/ThemeContext";
import { updatePremiumPreferences } from "@/services/lmsService";

interface ThemeOption {
  id: ThemeId;
  label: string;
  premium: boolean;
  minPlan: "free" | "standard" | "pro_vip";
  previewClass: string;
  accentColor: string;
}

const THEMES: ThemeOption[] = [
  {
    id: "light",
    label: "Light",
    premium: false,
    minPlan: "free",
    previewClass: "bg-white border border-zinc-200",
    accentColor: "#0F172A",
  },
  {
    id: "dark",
    label: "Dark",
    premium: false,
    minPlan: "free",
    previewClass: "bg-[#0B0F19] border border-zinc-700",
    accentColor: "#3B82F6",
  },
  {
    id: "cyber_purple",
    label: "Cyber Purple",
    premium: true,
    minPlan: "standard",
    previewClass: "bg-gradient-to-br from-[#1a0533] via-[#0d001a] to-[#7c3aed] border border-purple-500/40",
    accentColor: "#A855F7",
  },
  {
    id: "neon_pink",
    label: "Neon Pink",
    premium: true,
    minPlan: "standard",
    previewClass: "bg-gradient-to-br from-[#1f001a] via-[#0f0010] to-[#ec4899] border border-pink-500/40",
    accentColor: "#EC4899",
  },
  {
    id: "emerald_green",
    label: "Emerald Green",
    premium: true,
    minPlan: "standard",
    previewClass: "bg-gradient-to-br from-[#00201a] via-[#001a10] to-[#10b981] border border-emerald-500/40",
    accentColor: "#10B981",
  },
  {
    id: "golden_sunset",
    label: "Golden Sunset",
    premium: true,
    minPlan: "standard",
    previewClass: "bg-gradient-to-br from-[#1c0e00] via-[#1a0800] to-[#f59e0b] border border-amber-500/40",
    accentColor: "#F59E0B",
  },
];

export const ThemeSwitcher: FC = () => {
  const { theme, setTheme, availableThemes, plan, themeLabel } = useTheme();

  const handleSelect = async (id: ThemeId, unlocked: boolean) => {
    if (!unlocked) {
      toast.error("🔒 Upgrade to Standard (19k) or Pro VIP (29k) to unlock premium themes!");
      return;
    }
    setTheme(id);
    try {
      await updatePremiumPreferences({ profile_bg_theme: id });
    } catch {
      // Preference preserved locally even if offline
    }
    toast.success(`Theme changed to "${themeLabel(id)}"!`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          <span>🎨</span>
          <span>App Theme</span>
          {plan !== "free" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 capitalize">
              Premium Unlocked ✨
            </span>
          )}
        </h3>
        <span className="text-xs text-zinc-400 font-mono">
          Active: <b className="text-zinc-700 dark:text-zinc-200 capitalize">{themeLabel(theme)}</b>
        </span>
      </div>

      {/* Fully Responsive Grid: 2 cols on mobile, 3 cols on tablet, 6 cols on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {THEMES.map(({ id, label, premium, previewClass }) => {
          const unlocked = availableThemes.includes(id) || !premium;
          const active = theme === id;

          return (
            <button
              key={id}
              onClick={() => handleSelect(id, unlocked)}
              className={`group relative flex flex-col items-center gap-2 rounded-xl p-2.5 border-2 transition-all cursor-pointer ${
                active
                  ? "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm"
                  : unlocked
                  ? "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900"
                  : "border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/40 opacity-60 cursor-not-allowed"
              }`}
            >
              {/* Theme Swatch Preview */}
              <div className={`h-11 w-full rounded-lg shadow-inner ${previewClass}`} />

              <div className="flex items-center justify-between w-full px-0.5">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  {label}
                </span>
                {premium && (
                  <span className="text-[9px] font-bold text-purple-500 uppercase tracking-wider">
                    VIP
                  </span>
                )}
              </div>

              {!unlocked && (
                <div className="absolute top-2 right-2 p-1 rounded-md bg-black/40 backdrop-blur-xs text-white">
                  <Lock size={11} />
                </div>
              )}

              {active && (
                <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {plan === "free" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          🔒 Premium themes require <span className="font-semibold text-purple-500">Standard (19,000 UZS)</span> or higher plan.
        </p>
      )}
    </div>
  );
};

export default ThemeSwitcher;

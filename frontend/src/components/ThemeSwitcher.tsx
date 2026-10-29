/**
 * ThemeSwitcher – UI panel shown in the student Profile page.
 * Free users can pick light/dark/default.
 * Premium users see all 7 themes; locked ones show a 🔒 icon.
 */
import { FC } from "react";
import { useTheme, ThemeId } from "@/contexts/ThemeContext";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { updatePremiumPreferences } from "@/services/lmsService";

const ALL_THEMES: { id: ThemeId; label: string; premium: boolean; preview: string }[] = [
  { id: "default",       label: "Default",       premium: false, preview: "bg-zinc-100 dark:bg-zinc-800" },
  { id: "light",         label: "Light",         premium: false, preview: "bg-white" },
  { id: "dark",          label: "Dark",          premium: false, preview: "bg-zinc-900" },
  { id: "cyber_purple",  label: "Cyber Purple",  premium: true,  preview: "bg-gradient-to-br from-purple-900 to-indigo-950" },
  { id: "neon_pink",     label: "Neon Pink",     premium: true,  preview: "bg-gradient-to-br from-pink-900 to-fuchsia-950" },
  { id: "emerald_green", label: "Emerald Green", premium: true,  preview: "bg-gradient-to-br from-emerald-900 to-teal-950" },
  { id: "golden_sunset", label: "Golden Sunset", premium: true,  preview: "bg-gradient-to-br from-amber-900 to-orange-950" },
];

const ThemeSwitcher: FC = () => {
  const { theme, setTheme, availableThemes, plan, themeLabel } = useTheme();

  const handleSelect = async (id: ThemeId, unlocked: boolean) => {
    if (!unlocked) {
      toast.error("Upgrade to Standard or Pro VIP to unlock premium themes! 🔒");
      return;
    }
    setTheme(id);
    try {
      await updatePremiumPreferences({ profile_bg_theme: id });
    } catch {
      // Best-effort – local theme already applied
    }
    toast.success(`Theme changed to "${themeLabel(id)}"!`);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
        🎨 App Theme
        {plan !== "free" && (
          <span className="ml-2 text-xs text-purple-500 font-medium">Premium Unlocked ✨</span>
        )}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {ALL_THEMES.map(({ id, label, premium, preview }) => {
          const unlocked = availableThemes.includes(id);
          const active = theme === id;
          return (
            <button
              key={id}
              onClick={() => handleSelect(id, unlocked)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-all
                ${active ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700" : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"}
                ${!unlocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
              `}
              title={unlocked ? label : `${label} – requires Standard plan`}
            >
              {/* Colour swatch */}
              <div className={`h-10 w-full rounded-lg ${preview}`} />
              <span className="text-xs text-zinc-600 dark:text-zinc-400 text-center leading-tight">
                {label}
              </span>
              {!unlocked && (
                <span className="absolute top-1 right-1 text-zinc-400">
                  <Lock size={12} />
                </span>
              )}
              {active && (
                <span className="absolute top-1 left-1 text-blue-500 text-xs font-bold">✓</span>
              )}
            </button>
          );
        })}
      </div>
      {plan === "free" && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          🔒 Premium themes require <span className="font-semibold text-purple-500">Standard (19,000 UZS)</span> or higher plan.
        </p>
      )}
    </div>
  );
};

export default ThemeSwitcher;

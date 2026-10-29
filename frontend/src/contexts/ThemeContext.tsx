/**
 * ThemeContext – manages the premium CSS theme applied to the whole app.
 *
 * - Free users: "default" | "light" | "dark"
 * - Standard/Pro VIP users: additionally "cyber_purple" | "neon_pink" | "emerald_green" | "golden_sunset"
 *
 * The active theme is stored in localStorage and applied as a CSS class on <html>.
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

// Map theme IDs → CSS class names
const THEME_CSS: Record<string, string> = {
  default:        "theme-default",
  light:          "theme-light",
  dark:           "theme-dark",
  cyber_purple:   "theme-cyber-purple",
  neon_pink:      "theme-neon-pink",
  emerald_green:  "theme-emerald-green",
  golden_sunset:  "theme-golden-sunset",
};

const FREE_THEMES = ["default", "light", "dark"];
const PREMIUM_THEMES = ["cyber_purple", "neon_pink", "emerald_green", "golden_sunset"];

export type ThemeId = keyof typeof THEME_CSS;

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  availableThemes: ThemeId[];
  plan: string;
  setPlan: (plan: string) => void;
  themeLabel: (id: string) => string;
}

const LABELS: Record<string, string> = {
  default:        "Default",
  light:          "Light",
  dark:           "Dark",
  cyber_purple:   "Cyber Purple",
  neon_pink:      "Neon Pink",
  emerald_green:  "Emerald Green",
  golden_sunset:  "Golden Sunset",
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
  availableThemes: FREE_THEMES as ThemeId[],
  plan: "free",
  setPlan: () => {},
  themeLabel: (id) => LABELS[id] ?? id,
});

const LS_THEME_KEY = "el_premium_theme";
const LS_PLAN_KEY  = "el_premium_plan";

function applyThemeClass(id: string) {
  const root = document.documentElement;
  // Remove all theme classes
  Object.values(THEME_CSS).forEach((cls) => root.classList.remove(cls));
  const cls = THEME_CSS[id] ?? THEME_CSS["default"];
  if (cls && cls !== "theme-default") root.classList.add(cls);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    return (localStorage.getItem(LS_THEME_KEY) as ThemeId) ?? "default";
  });
  const [plan, setPlanState] = useState<string>(() => {
    return localStorage.getItem(LS_PLAN_KEY) ?? "free";
  });

  const availableThemes: ThemeId[] =
    plan === "free"
      ? (FREE_THEMES as ThemeId[])
      : ([...FREE_THEMES, ...PREMIUM_THEMES] as ThemeId[]);

  // Apply theme class on mount and change
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    const allowed = plan === "free" ? FREE_THEMES : [...FREE_THEMES, ...PREMIUM_THEMES];
    const safe = allowed.includes(id) ? id : "default";
    localStorage.setItem(LS_THEME_KEY, safe);
    setThemeState(safe as ThemeId);
  }, [plan]);

  const setPlan = useCallback((p: string) => {
    localStorage.setItem(LS_PLAN_KEY, p);
    setPlanState(p);
    // If current theme is premium and plan downgraded to free, reset
    if (p === "free" && PREMIUM_THEMES.includes(theme)) {
      setTheme("default");
    }
  }, [theme, setTheme]);

  const themeLabel = (id: string) => LABELS[id] ?? id;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes, plan, setPlan, themeLabel }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

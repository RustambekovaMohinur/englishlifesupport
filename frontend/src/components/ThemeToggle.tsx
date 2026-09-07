import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Universal theme toggle that flips the .dark class on <html>,
 * persists the preference to localStorage, and dispatches a 'themechange' event.
 */
export function toggleTheme() {
  if (typeof window === "undefined") return;
  const isDark = document.documentElement.classList.contains("dark");
  if (isDark) {
    document.documentElement.classList.remove("dark");
    try {
      localStorage.setItem("theme", "light");
    } catch (e) {}
  } else {
    document.documentElement.classList.add("dark");
    try {
      localStorage.setItem("theme", "dark");
    } catch (e) {}
  }
  window.dispatchEvent(new Event("themechange"));
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const handleSync = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    // Ensure initial sync
    handleSync();

    // Listen to custom event for same-window multi-instance sync
    window.addEventListener("themechange", handleSync);
    // Listen to storage event for cross-tab sync
    window.addEventListener("storage", handleSync);

    // MutationObserver on <html> class attribute for external modifications
    let observer: MutationObserver | null = null;
    try {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "class") {
            handleSync();
          }
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    } catch (e) {}

    return () => {
      window.removeEventListener("themechange", handleSync);
      window.removeEventListener("storage", handleSync);
      if (observer) observer.disconnect();
    };
  }, []);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`relative inline-flex items-center justify-center p-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-850/80 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 backdrop-blur-xs transition-all duration-200 active:scale-95 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${className}`}
    >
      <span className="relative flex items-center justify-center h-4 w-4 overflow-hidden pointer-events-none">
        <Sun
          className={`h-4 w-4 text-amber-500 transition-all duration-300 transform ${
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0 absolute"
          }`}
        />
        <Moon
          className={`h-4 w-4 text-indigo-500 transition-all duration-300 transform ${
            isDark ? "rotate-90 scale-0 opacity-0 absolute" : "rotate-0 scale-100 opacity-100"
          }`}
        />
      </span>
    </button>
  );
}

export default ThemeToggle;

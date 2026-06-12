import { useEffect, useState } from "react";
import { applyTheme, resolveTheme, setTheme, type Theme } from "../theme";

export function ThemeToggle() {
  // Default matches the no-flash script's fallback; corrected on mount from storage.
  const [theme, setThemeState] = useState<Theme>("dark");
  const isDark = theme === "dark";

  useEffect(() => {
    const t = resolveTheme();
    setThemeState(t);
    applyTheme(t);
  }, []);

  function toggle() {
    const next: Theme = isDark ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={toggle}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-neutral-300 transition-colors dark:bg-neutral-700"
    >
      <span
        className={`inline-flex size-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
          isDark ? "translate-x-5" : "translate-x-0.5"
        }`}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 text-amber-500"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 text-neutral-700"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

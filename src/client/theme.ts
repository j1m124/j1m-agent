// Theme state: a `.dark` class on <html> drives Tailwind's dark: variant. Persisted in
// localStorage; falls back to the OS preference. The no-flash inline script in
// __root.tsx applies it before first paint; this module is the runtime toggle.

const THEME_KEY = "j1m:theme";
export type Theme = "light" | "dark";

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage unavailable — still apply for this session
  }
  applyTheme(theme);
}

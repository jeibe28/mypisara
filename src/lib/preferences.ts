export const PREFERENCES_KEY = "mypisara:preferences";

export const THEMES = ["light", "dark", "system"] as const;
export const SIZES = ["small", "medium", "large"] as const;
export const ACCENTS = ["yellow", "blue", "green", "neutral"] as const;

export type ThemePreference = (typeof THEMES)[number];
export type InterfaceSize = (typeof SIZES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Preferences = { theme: ThemePreference; size: InterfaceSize; accent: Accent };

export const defaultPreferences: Preferences = { theme: "system", size: "medium", accent: "yellow" };

export function normalizePreferences(value: unknown): Preferences {
  const saved = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], item: unknown, fallback: T) =>
    list.includes(item as T) ? (item as T) : fallback;
  return {
    theme: pick(THEMES, saved.theme, defaultPreferences.theme),
    size: pick(SIZES, saved.size, defaultPreferences.size),
    accent: pick(ACCENTS, saved.accent, defaultPreferences.accent),
  };
}

export function readPreferences(): Preferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}"));
  } catch {
    return defaultPreferences;
  }
}

export function applyPreferences({ theme, size, accent }: Preferences) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.size = size;
  root.dataset.accent = accent;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111111" : "#f5f5f5");
}

export function savePreferences(next: Preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  } catch {}
  applyPreferences(next);
}

// Runs before first paint so the saved theme, size and accent never flash.
export const preferencesScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFERENCES_KEY,
)})||"{}"),t=p.theme||"system",r=document.documentElement,d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);r.dataset.theme=d?"dark":"light";r.dataset.size=p.size||"medium";r.dataset.accent=p.accent||"yellow"}catch(e){}})()`;

import { useCallback, useEffect, useState } from "react";

/**
 * `system` follows the OS; `light`/`dark` are explicit overrides. An
 * explicit choice is remembered; `system` forgets it and tracks the OS
 * again.
 */
export type Theme = "system" | "light" | "dark";

/** What `system` resolves to right now. */
export type Resolved = "light" | "dark";

const KEY = "markdiff.theme";

function readStored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    // localStorage can throw in a locked-down webview; fall through.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Drives the `data-theme` attribute the stylesheet keys off. The attribute
 * is removed for `system` so the media-query default takes over; that is
 * the one state the CSS treats as "no explicit choice".
 */
export function useTheme(): {
  theme: Theme;
  resolved: Resolved;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track the OS while on `system`, so the app follows a mid-session
  // change (the menu-bar toggle, or sunset on an auto-switching Mac).
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: Resolved =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Persisting is best-effort.
    }
  }, []);

  // Flip to the opposite of what is on screen, becoming an explicit choice.
  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { theme, resolved, setTheme, toggle };
}

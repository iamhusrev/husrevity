"use client";

import type React from "react";
import { createContext, useState, useContext, useEffect } from "react";
import { DARK_QUERY, LEGACY_THEME_KEY, THEME_STORAGE_KEY } from "./theme-storage";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextType = {
  /** The stored preference, including "system". */
  theme: Theme;
  /** What is actually shown right now. */
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function osPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function resolve(t: Theme): ResolvedTheme {
  return t === "dark" || (t === "system" && osPrefersDark()) ? "dark" : "light";
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    // The previous build defaulted to "light" and wrote it back for every visitor, so a legacy
    // "light" says nothing about intent. A legacy "dark" can only have come from a click.
    if (localStorage.getItem(LEGACY_THEME_KEY) === "dark") return "dark";
  } catch {
    // Storage can be blocked (private mode); fall through to the system default.
  }
  return "system";
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setIsInitialized(true);
  }, []);

  // The inline script in the root layout already set the right class before first paint, so
  // nothing is applied until the stored preference has been read.
  useEffect(() => {
    if (!isInitialized) return;
    const apply = () => {
      const next = resolve(theme);
      document.documentElement.classList.toggle("dark", next === "dark");
      setResolvedTheme(next);
    };
    apply();
    if (theme !== "system") return;
    // In system mode the OS decides, including its automatic day/night switch.
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, isInitialized]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // Not persisted; the choice still applies for this session.
    }
  };

  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

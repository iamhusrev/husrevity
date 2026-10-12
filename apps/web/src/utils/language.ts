import type { i18n as I18nInstance } from "i18next";

export const LANGUAGE_STORAGE_KEY = "husrevity:language";
export const SUPPORTED_LANGUAGES = ["tr", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "tr";

export function getStoredLanguage(): SupportedLanguage {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return DEFAULT_LANGUAGE;
    }
    const val = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (val === "tr" || val === "en") {
      return val;
    }
    return DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setStoredLanguage(lng: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    if (lng === "tr" || lng === "en") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    }
  } catch {
    // Ignore quota or security restrictions in private browsing.
  }
}

export function applyStoredLanguage(i18n: I18nInstance): void {
  const stored = getStoredLanguage();
  if (stored && i18n && i18n.language !== stored) {
    i18n.changeLanguage(stored);
  }
}

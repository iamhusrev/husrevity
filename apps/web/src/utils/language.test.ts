import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredLanguage,
  setStoredLanguage,
  LANGUAGE_STORAGE_KEY,
  applyStoredLanguage,
} from "./language";

describe("language storage and persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("applies stored valid language on init", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(getStoredLanguage()).toBe("en");

    localStorage.setItem(LANGUAGE_STORAGE_KEY, "tr");
    expect(getStoredLanguage()).toBe("tr");
  });

  it("falls back to 'tr' on invalid stored language without crashing", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(getStoredLanguage()).toBe("tr");

    localStorage.setItem(LANGUAGE_STORAGE_KEY, "");
    expect(getStoredLanguage()).toBe("tr");
  });

  it("falls back to 'tr' when localStorage throws without crashing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Quota or security error");
    });
    expect(getStoredLanguage()).toBe("tr");
  });

  it("changing the language writes to localStorage wrapped in try/catch", () => {
    setStoredLanguage("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");

    setStoredLanguage("tr");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("tr");

    // Invalid language is ignored
    setStoredLanguage("es" as any);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("tr");

    // Throwing localStorage doesn't throw
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });
    expect(() => setStoredLanguage("en")).not.toThrow();
  });

  it("applyStoredLanguage changes i18n language to stored language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    const fakeI18n = {
      language: "tr",
      changeLanguage: vi.fn(),
    };
    applyStoredLanguage(fakeI18n as any);
    expect(fakeI18n.changeLanguage).toHaveBeenCalledWith("en");
  });
});

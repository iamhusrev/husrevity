import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT } from "./theme-storage";

function setOsDark(dark: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("dark") ? dark : !dark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}
const run = () => new Function(THEME_INIT_SCRIPT)();
const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});
afterEach(() => vi.restoreAllMocks());

/**
 * The script runs in <head> before first paint so the page never flashes light on a dark device.
 * It must make the same decision as ThemeProvider.
 */
describe("theme init script", () => {
  it("is non-empty and self-contained", () => {
    expect(THEME_INIT_SCRIPT.length).toBeGreaterThan(20);
  });

  it("follows a dark OS when nothing is stored", () => {
    setOsDark(true);
    run();
    expect(isDark()).toBe(true);
  });

  it("stays light on a light OS when nothing is stored", () => {
    setOsDark(false);
    run();
    expect(isDark()).toBe(false);
  });

  it("honours an explicit stored dark on a light OS", () => {
    setOsDark(false);
    localStorage.setItem("theme-preference", "dark");
    run();
    expect(isDark()).toBe(true);
  });

  it("honours an explicit stored light on a dark OS", () => {
    setOsDark(true);
    localStorage.setItem("theme-preference", "light");
    run();
    expect(isDark()).toBe(false);
  });

  it("follows the OS when the stored preference is system", () => {
    setOsDark(true);
    localStorage.setItem("theme-preference", "system");
    run();
    expect(isDark()).toBe(true);
  });

  it("ignores the legacy 'light' value but keeps a legacy 'dark'", () => {
    setOsDark(true);
    localStorage.setItem("theme", "light");
    run();
    expect(isDark()).toBe(true);

    document.documentElement.classList.remove("dark");
    setOsDark(false);
    localStorage.setItem("theme", "dark");
    run();
    expect(isDark()).toBe(true);
  });

  it("treats garbage as system", () => {
    setOsDark(true);
    localStorage.setItem("theme-preference", "purple");
    run();
    expect(isDark()).toBe(true);
  });

  it("falls back to the OS when storage throws", () => {
    setOsDark(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    run();
    expect(isDark()).toBe(true);
  });

  it("removes a stale dark class when the decision is light", () => {
    setOsDark(false);
    document.documentElement.classList.add("dark");
    run();
    expect(isDark()).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

/** A controllable `prefers-color-scheme` so tests can flip the OS appearance mid-test. */
function mockOsScheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query.includes("dark") ? dark : !dark;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (event: { matches: boolean }) => void) =>
      listeners.delete(cb),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    setDark(next: boolean) {
      dark = next;
      act(() => listeners.forEach((cb) => cb({ matches: next })));
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="state" data-theme={theme} data-resolved={resolvedTheme} />
      <button onClick={() => setTheme("light")}>set-light</button>
      <button onClick={() => setTheme("dark")}>set-dark</button>
      <button onClick={() => setTheme("system")}>set-system</button>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
const state = () => screen.getByTestId("state");
const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});
afterEach(cleanup);

describe("ThemeProvider follows the system appearance", () => {
  it("defaults to system and goes dark when the OS is dark", () => {
    mockOsScheme(true);
    renderProbe();
    expect(state().dataset.theme).toBe("system");
    expect(state().dataset.resolved).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("defaults to system and stays light when the OS is light", () => {
    mockOsScheme(false);
    renderProbe();
    expect(state().dataset.resolved).toBe("light");
    expect(isDark()).toBe(false);
  });

  it("ignores the legacy 'light' value, which the old default wrote for everyone", () => {
    mockOsScheme(true);
    localStorage.setItem("theme", "light");
    renderProbe();
    expect(state().dataset.theme).toBe("system");
    expect(isDark()).toBe(true);
  });

  it("keeps a legacy 'dark' value as an explicit choice (only a click could have set it)", () => {
    mockOsScheme(false);
    localStorage.setItem("theme", "dark");
    renderProbe();
    expect(state().dataset.theme).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("restores a stored explicit preference", () => {
    mockOsScheme(true);
    localStorage.setItem("theme-preference", "light");
    renderProbe();
    expect(state().dataset.theme).toBe("light");
    expect(isDark()).toBe(false);
  });

  it("switches live when the OS appearance changes while in system mode", () => {
    const os = mockOsScheme(false);
    renderProbe();
    expect(isDark()).toBe(false);

    os.setDark(true);
    expect(isDark()).toBe(true);
    expect(state().dataset.resolved).toBe("dark");

    os.setDark(false);
    expect(isDark()).toBe(false);
  });

  it("ignores OS changes once an explicit theme is chosen, and stops listening", () => {
    const os = mockOsScheme(false);
    renderProbe();
    expect(os.listenerCount()).toBe(1);

    fireEvent.click(screen.getByText("set-light"));
    expect(os.listenerCount()).toBe(0);
    os.setDark(true);
    expect(isDark()).toBe(false);

    fireEvent.click(screen.getByText("set-system"));
    expect(os.listenerCount()).toBe(1);
    expect(isDark()).toBe(true);
  });

  it("persists only explicit choices, under the new key", () => {
    mockOsScheme(false);
    renderProbe();
    expect(localStorage.getItem("theme-preference")).toBeNull();

    fireEvent.click(screen.getByText("set-dark"));
    expect(localStorage.getItem("theme-preference")).toBe("dark");

    fireEvent.click(screen.getByText("set-system"));
    expect(localStorage.getItem("theme-preference")).toBe("system");
  });

  it("toggle flips against what is currently shown, also from system mode", () => {
    mockOsScheme(true);
    renderProbe();
    fireEvent.click(screen.getByText("toggle"));
    expect(state().dataset.theme).toBe("light");
    expect(isDark()).toBe(false);
    fireEvent.click(screen.getByText("toggle"));
    expect(state().dataset.theme).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("removes its OS listener on unmount", () => {
    const os = mockOsScheme(false);
    const { unmount } = renderProbe();
    expect(os.listenerCount()).toBe(1);
    unmount();
    expect(os.listenerCount()).toBe(0);
  });
});

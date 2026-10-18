import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/providers/ThemeContext";
import { ThemeToggleButton } from "./ThemeToggleButton";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
      i18n: { language: "en" },
    }),
  };
});

const renderButton = () =>
  render(
    <ThemeProvider>
      <ThemeToggleButton />
    </ThemeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});
afterEach(cleanup);

describe("ThemeToggleButton", () => {
  it("starts in automatic mode and says so", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Theme: automatic (follows system)" })).toBeTruthy();
  });

  it("cycles automatic -> light -> dark -> automatic and stores each explicit choice", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeTruthy();
    expect(localStorage.getItem("theme-preference")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeTruthy();
    expect(localStorage.getItem("theme-preference")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Theme: automatic (follows system)" })).toBeTruthy();
    expect(localStorage.getItem("theme-preference")).toBe("system");
  });

  it("restores the stored mode on load", () => {
    localStorage.setItem("theme-preference", "dark");
    renderButton();
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeTruthy();
  });
});

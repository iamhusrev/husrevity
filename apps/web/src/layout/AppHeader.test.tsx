import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AppHeader from "./AppHeader";
import { QuickAddProvider } from "@/providers/QuickAddContext";

vi.mock("@/components/header/DateTimeClock", () => ({ default: () => <div data-testid="date-time-clock" /> }));
vi.mock("@/components/header/LanguageDropdown", () => ({ default: () => <div data-testid="language-dropdown" /> }));
vi.mock("@/components/header/NotificationDropdown", () => ({ default: () => <div data-testid="notification-dropdown" /> }));
vi.mock("@/components/header/ThemeToggleButton", () => ({ ThemeToggleButton: () => <button>theme</button> }));
vi.mock("@/components/header/UserDropdown", () => ({ default: () => <div data-testid="user-dropdown" /> }));
vi.mock("@/components/ai/TodaySuggestionsModal", () => ({ default: () => null }));
vi.mock("@/providers/SidebarContext", () => ({
  useSidebar: () => ({
    toggleSidebar: vi.fn(),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

describe("AppHeader", () => {
  it("contains no text input and no search role", () => {
    render(
      <QuickAddProvider>
        <AppHeader />
      </QuickAddProvider>,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  it("does not intercept or preventDefault on ⌘K / Ctrl+K keydown", () => {
    render(
      <QuickAddProvider>
        <AppHeader />
      </QuickAddProvider>,
    );
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const dispatched = document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(dispatched).toBe(true);
  });
});

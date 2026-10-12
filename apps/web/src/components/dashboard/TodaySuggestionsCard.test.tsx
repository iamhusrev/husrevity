import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import TodaySuggestionsCard from "./TodaySuggestionsCard";
import { aiService } from "@/services/ai-service";

const auth = vi.hoisted(() => ({ userId: "u1" }));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { id: auth.userId } }),
}));

vi.mock("@/services/ai-service", () => ({
  aiService: {
    getSuggestions: vi.fn(),
  },
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          "dashboard.today.title": "Today Suggestions",
          "dashboard.today.kicker": "AI Suggestions",
          "dashboard.today.refreshAria": "Refresh suggestions",
          "dashboard.today.empty": "No suggestions yet",
          "dashboard.today.retry": "Get suggestions",
          "dashboard.today.unconfigured": "Gemini API key is not configured.",
        };
        return map[key] ?? fallback ?? key;
      },
    }),
  };
});

const mockSuggestions = [
  {
    kind: "task",
    title: "Review pull requests",
    description: "Check the open reviews for today.",
    sourceRef: { type: "task", id: "1" },
  },
];

describe("TodaySuggestionsCard", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    sessionStorage.clear();
    auth.userId = "u1";
    vi.clearAllMocks();
  });

  const renderCard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <TodaySuggestionsCard />
      </QueryClientProvider>,
    );

  it("mounting the card makes zero network/mutation calls", () => {
    renderCard();
    expect(aiService.getSuggestions).not.toHaveBeenCalled();
  });

  it("clicking the refresh/get suggestions button performs exactly one call and renders the result", async () => {
    const user = userEvent.setup();
    vi.mocked(aiService.getSuggestions).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: mockSuggestions as any,
    });

    renderCard();

    expect(aiService.getSuggestions).not.toHaveBeenCalled();

    // Click refresh button or retry/get button
    const refreshBtn = screen.getByRole("button", { name: /Refresh suggestions/i });
    await user.click(refreshBtn);

    expect(aiService.getSuggestions).toHaveBeenCalledTimes(1);
    await screen.findByText("Review pull requests");
  });

  it("after a successful call, remounting the card in the same session shows previous result without new call", async () => {
    const user = userEvent.setup();
    vi.mocked(aiService.getSuggestions).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: mockSuggestions as any,
    });

    const { unmount } = renderCard();

    const refreshBtn = screen.getByRole("button", { name: /Refresh suggestions/i });
    await user.click(refreshBtn);
    await screen.findByText("Review pull requests");
    expect(aiService.getSuggestions).toHaveBeenCalledTimes(1);

    // Unmount
    unmount();

    // Remount in same session
    renderCard();

    // Should immediately show cached result without additional network calls
    expect(screen.getByText("Review pull requests")).toBeInTheDocument();
    expect(aiService.getSuggestions).toHaveBeenCalledTimes(1);
  });

  it("does not show a result under a different count than it was generated for", async () => {
    const user = userEvent.setup();
    vi.mocked(aiService.getSuggestions).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: mockSuggestions as any,
    });

    renderCard();
    await user.click(screen.getByRole("button", { name: /Refresh suggestions/i }));
    await screen.findByText("Review pull requests");

    await user.click(screen.getByRole("button", { name: "1" }));

    expect(screen.queryByText("Review pull requests")).not.toBeInTheDocument();
    expect(aiService.getSuggestions).toHaveBeenCalledTimes(1);
  });

  it("does not show another user's cached suggestions after an account switch", async () => {
    const user = userEvent.setup();
    vi.mocked(aiService.getSuggestions).mockResolvedValue({
      success: true,
      code: 200,
      message: "ok",
      data: mockSuggestions as any,
    });

    const first = renderCard();
    await user.click(screen.getByRole("button", { name: /Refresh suggestions/i }));
    await screen.findByText("Review pull requests");
    first.unmount();

    auth.userId = "u2";
    renderCard();

    expect(screen.queryByText("Review pull requests")).not.toBeInTheDocument();
  });

  it("renders the unconfigured-key error state when API reports unconfigured key", async () => {
    const user = userEvent.setup();
    vi.mocked(aiService.getSuggestions).mockRejectedValue({
      message: "GOOGLE_GEMINI_API_KEY is not configured",
      response: { data: { message: "GOOGLE_GEMINI_API_KEY is not configured" } },
    });

    renderCard();

    const refreshBtn = screen.getByRole("button", { name: /Refresh suggestions/i });
    await user.click(refreshBtn);

    await screen.findByText("Gemini API key is not configured.");
  });
});

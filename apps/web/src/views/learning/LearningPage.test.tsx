import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import LearningPage from "./LearningPage";
import { verifyBackdropCloseFromTrigger, verifyDialogFromTrigger } from "@/test/dialog-contract";

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

const { mutation, topicsResult } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  topicsResult: {
    data: [
      {
        id: "t1",
        title: "Rust",
        description: null,
        position: 0,
        items: [
          {
            id: "i1",
            topicId: "t1",
            subtopicId: null,
            text: "Read the book",
            url: null,
            notes: null,
            estimatedMinutes: null,
            reviewAt: null,
            notifyMinutesBefore: null,
            completedAt: null,
            position: 0,
          },
        ],
        subtopics: [
          {
            id: "s1",
            topicId: "t1",
            title: "Ownership",
            description: null,
            position: 0,
            items: [],
            itemCount: 0,
            completedCount: 0,
            createdAt: "2026-06-01T00:00:00Z",
            updatedAt: "2026-06-01T00:00:00Z",
          },
        ],
        itemCount: 1,
        completedCount: 0,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "t2",
        title: "Go",
        description: null,
        position: 1,
        items: [
          {
            id: "i2",
            topicId: "t2",
            subtopicId: null,
            text: "Tour of Go",
            url: null,
            notes: null,
            estimatedMinutes: null,
            reviewAt: null,
            notifyMinutesBefore: null,
            completedAt: null,
            position: 0,
          },
        ],
        subtopics: [],
        itemCount: 1,
        completedCount: 0,
        createdAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      },
    ],
    isLoading: false,
    isError: false,
    refetch: () => {},
  },
}));

vi.mock("@/hooks/useLearning", () => ({
  useLearningTopics: () => topicsResult,
  useCreateLearningItem: () => mutation(),
  useCreateLearningSubtopic: () => mutation(),
  useCreateLearningTopic: () => mutation(),
  useDeleteLearningItem: () => mutation(),
  useDeleteLearningSubtopic: () => mutation(),
  useDeleteLearningTopic: () => mutation(),
  useToggleLearningItem: () => mutation(),
  useUpdateLearningItem: () => mutation(),
  useUpdateLearningSubtopic: () => mutation(),
  useUpdateLearningTopic: () => mutation(),
}));

vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div>crumb</div> }));
vi.mock("@/components/ai/DictateQuickAddModal", () => ({ default: () => null }));
vi.mock("@/components/notifications/LeadTimeSelect", () => ({ default: () => <div>lead</div> }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const OPEN_KEY = "learning.openTopics";
const YEAR_KEY = "learning.year";

describe("LearningPage topic dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<LearningPage />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: "New topic" }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<LearningPage />);
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: "New topic" }));
  });
});

describe("LearningPage subtopic dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    // The trigger lives in the topic body, which is collapsed by default.
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t1"]));
    render(<LearningPage />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /New subtopic/ }));
  });
});

describe("LearningPage item dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t1"]));
    render(<LearningPage />);
    // The row is a component declared inside TopicCard's render, so it remounts when the page
    // state changes and the original trigger is gone by the time the dialog closes.
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /Read the book/ }), {
      triggerUnmounts: true,
    });
  });
});

describe("LearningPage collapsible topics", () => {
  it("starts collapsed: title visible, item rows hidden", () => {
    render(<LearningPage />);
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.queryByText("Read the book")).toBeNull();
    expect(screen.queryByText("Tour of Go")).toBeNull();
  });

  it("expands and collapses a topic from its chevron", () => {
    render(<LearningPage />);
    const rustToggle = screen.getByRole("button", { name: "Rust" });
    expect(rustToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(rustToggle);
    expect(screen.getByText("Read the book")).toBeTruthy();
    expect(screen.queryByText("Tour of Go")).toBeNull();
    expect(rustToggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(rustToggle);
    expect(rustToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Read the book")).toBeNull();
  });

  it("restores expanded topics from localStorage", () => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t2"]));
    render(<LearningPage />);
    expect(screen.getByText("Tour of Go")).toBeTruthy();
    expect(screen.queryByText("Read the book")).toBeNull();
  });

  it("persists toggles and ignores corrupt stored state", () => {
    localStorage.setItem(OPEN_KEY, "{not json");
    render(<LearningPage />);
    expect(screen.queryByText("Read the book")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rust" }));
    expect(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]")).toEqual(["t1"]);
  });

  it("expands and collapses every visible topic at once", () => {
    render(<LearningPage />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Read the book")).toBeTruthy();
    expect(screen.getByText("Tour of Go")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Read the book")).toBeNull();
    expect(screen.queryByText("Tour of Go")).toBeNull();
  });
});

describe("LearningPage year filter", () => {
  it("lists distinct years newest first after All years", () => {
    render(<LearningPage />);
    const select = screen.getByRole("combobox", { name: "Filter by year" });
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(["All years", "2026", "2025"]);
  });

  it("filters topics by creation year and restores them with All years", () => {
    render(<LearningPage />);
    const select = screen.getByRole("combobox", { name: "Filter by year" });
    fireEvent.change(select, { target: { value: "2025" } });
    expect(screen.queryByText("Rust")).toBeNull();
    expect(screen.getByText("Go")).toBeTruthy();
    expect(localStorage.getItem(YEAR_KEY)).toBe("2025");
    fireEvent.change(select, { target: { value: "all" } });
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
  });

  it("falls back to all years when the stored year has no topics", () => {
    localStorage.setItem(YEAR_KEY, "1999");
    render(<LearningPage />);
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
    const select = screen.getByRole("combobox", { name: "Filter by year" }) as HTMLSelectElement;
    expect(select.value).toBe("all");
  });

  it("hides the year select when every topic is from one year", () => {
    const original = topicsResult.data;
    topicsResult.data = [original[0]];
    try {
      render(<LearningPage />);
      expect(screen.queryByRole("combobox", { name: "Filter by year" })).toBeNull();
    } finally {
      topicsResult.data = original;
    }
  });

  it("expand all under a year filter only opens and stores the visible topics", () => {
    render(<LearningPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by year" }), {
      target: { value: "2025" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Tour of Go")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]")).toEqual(["t2"]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]")).toEqual([]);
  });
});

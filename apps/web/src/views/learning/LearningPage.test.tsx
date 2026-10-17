import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const { mutation, topicsResult, createItem } = vi.hoisted(() => ({
  createItem: vi.fn(),
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
  useCreateLearningItem: () => ({ mutateAsync: createItem, mutate: vi.fn(), isPending: false }),
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

beforeEach(() => {
  localStorage.clear();
  createItem.mockReset();
  createItem.mockResolvedValue(undefined);
});
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

describe("LearningPage open topic body", () => {
  it("shows a quiet hint instead of blank space when a topic has no items or subtopics", () => {
    const original = topicsResult.data;
    topicsResult.data = [
      { ...original[1], id: "t3", title: "Zig", items: [], subtopics: [], itemCount: 0 },
    ];
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t3"]));
    try {
      render(<LearningPage />);
      expect(screen.getByText("Nothing here yet. Add the first item below.")).toBeTruthy();
      // The add row is still there, so the hint never replaces the way in.
      expect(screen.getByPlaceholderText("Add item…")).toBeTruthy();
    } finally {
      topicsResult.data = original;
    }
  });

  it("shows a hint inside an empty subtopic and no topic-level hint when items exist", () => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t1"]));
    render(<LearningPage />);
    expect(screen.getByText("Ownership")).toBeTruthy();
    expect(screen.getByText("No items yet.")).toBeTruthy();
    expect(screen.queryByText("Nothing here yet. Add the first item below.")).toBeNull();
  });

  it("does not hide edit and delete behind hover-only classes (class contract, not a browser check)", () => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t1"]));
    render(<LearningPage />);
    // Unconditional `opacity-0` would hide the control on touch screens, where there is no hover.
    // Hiding is only allowed behind the fine-pointer media variant.
    const bareOpacityZero = /(^|\s)opacity-0(\s|$)/;
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons.length).toBeGreaterThan(0);
    for (const button of deleteButtons) {
      expect(button.className).not.toMatch(bareOpacityZero);
      expect(button.className).toContain("pointer-fine:opacity-0");
    }
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    // One per topic header (Rust, Go) plus one per subtopic (Ownership).
    expect(editButtons).toHaveLength(3);
    for (const button of editButtons) {
      expect(button.className).not.toMatch(bareOpacityZero);
    }
  });
});

describe("LearningPage add-item rows", () => {
  const openRust = () => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t1"]));
    render(<LearningPage />);
    // The topic-level row comes before the subtopic rows.
    const [topicInput, subtopicInput] = screen.getAllByPlaceholderText(
      "Add item…",
    ) as HTMLInputElement[];
    return { topicInput, subtopicInput };
  };

  it("submits trimmed text to the topic on Enter and clears the field", async () => {
    const { topicInput } = openRust();

    fireEvent.change(topicInput, { target: { value: "  Learn traits  " } });
    fireEvent.keyDown(topicInput, { key: "Enter" });

    await waitFor(() => expect(topicInput.value).toBe(""));
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem).toHaveBeenCalledWith({ topicId: "t1", body: { text: "Learn traits" } });
  });

  it("ignores Enter on blank text and keeps the add button disabled", () => {
    const { topicInput } = openRust();

    fireEvent.change(topicInput, { target: { value: "   " } });
    fireEvent.keyDown(topicInput, { key: "Enter" });

    expect(createItem).not.toHaveBeenCalled();
    const addButton = screen.getByRole("button", { name: "Add item… (Rust)" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
  });

  it("keeps the topic and subtopic drafts separate and posts the subtopic id", async () => {
    const { topicInput, subtopicInput } = openRust();

    fireEvent.change(subtopicInput, { target: { value: "Borrow checker" } });
    expect(topicInput.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Add item… (Ownership)" }));

    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith({
        topicId: "t1",
        body: { text: "Borrow checker", subtopicId: "s1" },
      }),
    );
    await waitFor(() => expect(subtopicInput.value).toBe(""));
  });

  it("keeps the same input element while typing so focus is not lost", () => {
    const { topicInput } = openRust();
    topicInput.focus();

    fireEvent.change(topicInput, { target: { value: "R" } });
    fireEvent.change(topicInput, { target: { value: "Ru" } });

    // A remounted input would be a different node and drop focus on every keystroke.
    expect(screen.getAllByPlaceholderText("Add item…")[0]).toBe(topicInput);
    expect(topicInput.isConnected).toBe(true);
    expect(document.activeElement).toBe(topicInput);
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

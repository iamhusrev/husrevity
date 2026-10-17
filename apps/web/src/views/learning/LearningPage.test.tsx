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

const { mutation, topicsResult, createItem, createTopic, updateTopic } = vi.hoisted(() => ({
  createItem: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  topicsResult: {
    data: [
      {
        id: "t1",
        title: "Rust",
        description: null as string | null,
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
        year: 2026,
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
        year: 2025,
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
  useCreateLearningTopic: () => ({ mutateAsync: createTopic, mutate: vi.fn(), isPending: false }),
  useDeleteLearningItem: () => mutation(),
  useDeleteLearningSubtopic: () => mutation(),
  useDeleteLearningTopic: () => mutation(),
  useToggleLearningItem: () => mutation(),
  useUpdateLearningItem: () => mutation(),
  useUpdateLearningSubtopic: () => mutation(),
  useUpdateLearningTopic: () => ({ mutateAsync: updateTopic, mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div>crumb</div> }));
vi.mock("@/components/ai/DictateQuickAddModal", () => ({ default: () => null }));
vi.mock("@/components/notifications/LeadTimeSelect", () => ({ default: () => <div>lead</div> }));

beforeEach(() => {
  localStorage.clear();
  createItem.mockReset();
  createItem.mockResolvedValue(undefined);
  createTopic.mockReset();
  createTopic.mockResolvedValue(undefined);
  updateTopic.mockReset();
  updateTopic.mockResolvedValue(undefined);
  // The fixtures are created in 2026 and 2025. Only Date is faked (timers stay real for
  // user-event and waitFor), so "the current year" is 2026 in every test unless it says otherwise.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T12:00:00Z") });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

describe("LearningPage card grid", () => {
  const cardOf = (title: string) =>
    screen.getByRole("button", { name: title }).closest("article") as HTMLElement;

  it("renders the topics as a responsive grid tabpanel the tabs control", () => {
    render(<LearningPage />);
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe("learning-topics");
    expect(panel.className).toContain("grid");
    expect(panel.className).toContain("sm:grid-cols-2");
    expect(panel.className).toContain("xl:grid-cols-3");
    expect(panel.className).not.toContain("grid-flow-dense");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-controls")).toBe("learning-topics");
    }
    expect(within(panel).getAllByRole("article")).toHaveLength(2);
  });

  it("spans an open card across the full row and leaves closed cards in one cell", () => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(["t1"]));
    render(<LearningPage />);
    expect(cardOf("Rust").className).toContain("sm:col-span-2");
    expect(cardOf("Rust").className).toContain("xl:col-span-3");
    expect(cardOf("Go").className).not.toContain("sm:col-span-2");
    expect(cardOf("Go").className).not.toContain("xl:col-span-3");
  });

  it("toggles the body from the title row and opens the edit dialog only from the pencil", async () => {
    render(<LearningPage />);
    const rustHeader = screen.getByRole("button", { name: "Rust" });
    // The visible title lives inside the toggle, so clicking the title opens the card.
    expect(rustHeader.textContent).toContain("Rust");
    expect(rustHeader.getAttribute("aria-expanded")).toBe("false");
    expect(rustHeader.getAttribute("aria-controls")).toBe("topic-body-t1");
    fireEvent.click(rustHeader);
    expect(rustHeader.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Read the book")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    const [rustPencil] = screen.getAllByRole("button", { name: "Edit" });
    fireEvent.click(rustPencil);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("learning.modal.editTitle")).toBeTruthy();
    expect((within(dialog).getByDisplayValue("Rust") as HTMLInputElement).value).toBe("Rust");
  });

  it("shows the progress summary on a collapsed card and clamps long text instead of truncating", () => {
    const original = topicsResult.data;
    topicsResult.data = [
      {
        ...original[0],
        description: "A long description that should wrap onto a second line before it is cut.",
      },
      original[1],
    ];
    try {
      render(<LearningPage />);
      const rust = cardOf("Rust");
      // "done/total · N subtopics" in one line (the mocked t returns keys for interpolated calls).
      expect(within(rust).getByText("learning.progress · learning.subtopicCount")).toBeTruthy();
      const description = within(rust).getByText(/A long description/);
      expect(description.className).toContain("line-clamp-2");
      expect(description.className).not.toMatch(/(^|\s)truncate(\s|$)/);
    } finally {
      topicsResult.data = original;
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

const tabNames = () =>
  within(screen.getByRole("tablist", { name: "Filter by year" }))
    .getAllByRole("tab")
    .map((tab) => tab.textContent?.replace(/\s+/g, " ").trim());

const selectedTab = () =>
  screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");

describe("LearningPage year tabs", () => {
  it("always shows a tablist: All plus every year newest first, each with a count", () => {
    render(<LearningPage />);
    expect(tabNames()).toEqual(["All · 2", "2026 · 1", "2025 · 1"]);
    expect(screen.queryByRole("combobox", { name: "Filter by year" })).toBeNull();
  });

  it("shows the All and year tabs even when every topic is from the same year", () => {
    const original = topicsResult.data;
    topicsResult.data = [original[0]];
    try {
      render(<LearningPage />);
      expect(tabNames()).toEqual(["All · 1", "2026 · 1"]);
    } finally {
      topicsResult.data = original;
    }
  });

  it("keeps the current year as a tab even when nothing was created in it", () => {
    vi.setSystemTime(new Date("2027-03-01T12:00:00Z"));
    render(<LearningPage />);
    expect(tabNames()).toEqual(["All · 2", "2027 · 0", "2026 · 1", "2025 · 1"]);
  });

  it("selecting a tab filters the cards, marks it selected and persists the year", () => {
    render(<LearningPage />);
    expect(selectedTab()?.textContent).toContain("All");
    fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));
    expect(screen.queryByText("Rust")).toBeNull();
    expect(screen.getByText("Go")).toBeTruthy();
    expect(selectedTab()?.textContent).toContain("2025");
    expect(localStorage.getItem(YEAR_KEY)).toBe("2025");
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
    expect(localStorage.getItem(YEAR_KEY)).toBe("all");
  });

  it("restores the stored year on load", () => {
    localStorage.setItem(YEAR_KEY, "2025");
    render(<LearningPage />);
    expect(selectedTab()?.textContent).toContain("2025");
    expect(screen.queryByText("Rust")).toBeNull();
  });

  it("falls back to All when the stored year has no tab", () => {
    localStorage.setItem(YEAR_KEY, "1999");
    render(<LearningPage />);
    expect(selectedTab()?.textContent).toContain("All");
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
  });

  it("moves and activates the selection with arrow, Home and End keys (roving tabindex)", () => {
    render(<LearningPage />);
    const [all, y2026, y2025] = screen.getAllByRole("tab");
    expect(all.tabIndex).toBe(0);
    expect(y2026.tabIndex).toBe(-1);
    expect(y2025.tabIndex).toBe(-1);

    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(y2026.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(y2026);
    expect(y2026.tabIndex).toBe(0);
    expect(all.tabIndex).toBe(-1);

    fireEvent.keyDown(y2026, { key: "End" });
    expect(y2025.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(y2025);
    expect(screen.queryByText("Rust")).toBeNull();

    fireEvent.keyDown(y2025, { key: "ArrowLeft" });
    expect(y2026.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(y2026, { key: "Home" });
    expect(all.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(all);
    expect(screen.getByText("Rust")).toBeTruthy();
  });

  it("shows a year chip on each card only while the All tab is active", () => {
    render(<LearningPage />);
    const goCard = screen.getByRole("button", { name: "Go" }).closest("article") as HTMLElement;
    expect(within(goCard).getByText("2025")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));
    const goCardFiltered = screen
      .getByRole("button", { name: "Go" })
      .closest("article") as HTMLElement;
    expect(within(goCardFiltered).queryByText("2025")).toBeNull();
  });

  it("shows a year empty state with New topic and a way back to all years", () => {
    vi.setSystemTime(new Date("2027-03-01T12:00:00Z"));
    render(<LearningPage />);
    fireEvent.click(screen.getByRole("tab", { name: /^2027/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).queryAllByRole("article")).toHaveLength(0);
    expect(within(panel).getByText(/Nothing filed under/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "New topic" })).toBeTruthy();
    // The page-level empty state is only for "no topics at all".
    expect(screen.queryByText("Your learning list is empty")).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand all" })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Show all years" }));
    expect(selectedTab()?.textContent).toContain("All");
    expect(localStorage.getItem(YEAR_KEY)).toBe("all");
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.getByText("Go")).toBeTruthy();
  });

  it("switches to the created topic's year so a new topic never lands behind another tab", async () => {
    createTopic.mockResolvedValue({
      success: true,
      message: "",
      code: "OK",
      data: { ...topicsResult.data[0], id: "t9", title: "Zig", createdAt: "2026-10-18T12:00:00Z" },
    });
    render(<LearningPage />);
    fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));
    fireEvent.click(screen.getByRole("button", { name: "New topic" }));
    const dialog = await screen.findByRole("dialog");
    // The mocked t returns keys when no fallback string is given, hence the keyed label.
    fireEvent.change(within(dialog).getByLabelText("learning.field.title"), {
      target: { value: "Zig" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createTopic).toHaveBeenCalledWith({ title: "Zig", description: null, year: 2025 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selectedTab()?.textContent).toContain("2026");
    expect(localStorage.getItem(YEAR_KEY)).toBe("2026");
  });

  it("stays on All after creating a topic there and does not persist a year tab", async () => {
    createTopic.mockResolvedValue({
      success: true,
      message: "",
      code: "OK",
      data: { ...topicsResult.data[0], id: "t9", title: "Zig", createdAt: "2026-10-18T12:00:00Z" },
    });
    render(<LearningPage />);
    fireEvent.click(screen.getByRole("button", { name: "New topic" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("learning.field.title"), {
      target: { value: "Zig" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createTopic).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selectedTab()?.textContent).toMatch(/^All/);
    expect(localStorage.getItem(YEAR_KEY)).toBeNull();
  });

  it("links the tabpanel to the selected tab so it has an accessible name", () => {
    render(<LearningPage />);
    expect(screen.getByRole("tabpanel", { name: /^All/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(selectedTab()?.id);
    expect(screen.getByRole("tabpanel", { name: /^2025/ })).toBeTruthy();
  });

  it("labels the year badge on a card so it is not a bare number", () => {
    render(<LearningPage />);
    // The badge only shows on the All tab, where the year is not otherwise visible.
    const badges = screen.getAllByText(/^Year:/);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0].parentElement?.textContent).toMatch(/Year:\s*20\d\d/);
  });

  it("files a topic under its explicit year, not its creation year", () => {
    const original = topicsResult.data;
    // Created in 2026 but filed under 2025 by the owner: the server-resolved year wins.
    topicsResult.data = [
      original[0],
      { ...original[1], id: "t3", title: "Zig", year: 2025, createdAt: "2026-02-01T00:00:00Z" },
    ];
    try {
      render(<LearningPage />);
      expect(tabNames()).toEqual(["All · 2", "2026 · 1", "2025 · 1"]);
      fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));
      expect(screen.getByText("Zig")).toBeTruthy();
      expect(screen.queryByText("Rust")).toBeNull();
      fireEvent.click(screen.getByRole("tab", { name: /^2026/ }));
      expect(screen.queryByText("Zig")).toBeNull();
      expect(screen.getByText("Rust")).toBeTruthy();
    } finally {
      topicsResult.data = original;
    }
  });

  it("falls back to the creation year only when a cached response has no usable year", () => {
    const original = topicsResult.data;
    // Old cached payloads (before the API shipped `year`) or a corrupt value must not break tabs.
    topicsResult.data = [
      { ...original[0], id: "t4", title: "Stale", year: undefined as unknown as number },
      { ...original[1], id: "t5", title: "Broken", year: Number.NaN },
    ];
    try {
      render(<LearningPage />);
      expect(tabNames()).toEqual(["All · 2", "2026 · 1", "2025 · 1"]);
    } finally {
      topicsResult.data = original;
    }
  });

  it("expand all under a year tab only opens and stores the visible topics", () => {
    render(<LearningPage />);
    fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Tour of Go")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]")).toEqual(["t2"]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]")).toEqual([]);
  });
});

const openTopicDialog = async (trigger: HTMLElement) => {
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  // The mocked t returns keys when no fallback string is given, hence the keyed labels.
  const yearSelect = within(dialog).getByLabelText("learning.field.year") as HTMLSelectElement;
  const titleInput = within(dialog).getByLabelText("learning.field.title") as HTMLInputElement;
  const save = () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  return { dialog, yearSelect, titleInput, save };
};

const optionValues = (select: HTMLSelectElement) =>
  within(select)
    .getAllByRole("option")
    .map((option) => (option as HTMLOptionElement).value);

describe("LearningPage topic year field", () => {
  it("offers the existing years plus the current year and the three before it, newest first, once each", async () => {
    const original = topicsResult.data;
    // 2026 and 2025 exist as topics AND fall inside the rolling window: they must not repeat.
    topicsResult.data = [...original, { ...original[1], id: "t6", title: "COBOL", year: 2020 }];
    try {
      render(<LearningPage />);
      const { yearSelect } = await openTopicDialog(
        screen.getByRole("button", { name: "New topic" }),
      );
      expect(optionValues(yearSelect)).toEqual(["2026", "2025", "2024", "2023", "2020"]);
    } finally {
      topicsResult.data = original;
    }
  });

  it("preselects the active tab's year when creating and sends it in the body", async () => {
    render(<LearningPage />);
    fireEvent.click(screen.getByRole("tab", { name: /^2025/ }));
    const { yearSelect, titleInput, save } = await openTopicDialog(
      screen.getByRole("button", { name: "New topic" }),
    );
    expect(yearSelect.value).toBe("2025");
    fireEvent.change(titleInput, { target: { value: "Zig" } });
    save();
    await waitFor(() =>
      expect(createTopic).toHaveBeenCalledWith({ title: "Zig", description: null, year: 2025 }),
    );
  });

  it("preselects the current year when creating from the All tab", async () => {
    render(<LearningPage />);
    const { yearSelect, titleInput, save } = await openTopicDialog(
      screen.getByRole("button", { name: "New topic" }),
    );
    expect(yearSelect.value).toBe("2026");
    fireEvent.change(titleInput, { target: { value: "Zig" } });
    save();
    await waitFor(() =>
      expect(createTopic).toHaveBeenCalledWith({ title: "Zig", description: null, year: 2026 }),
    );
  });

  it("sends a changed year on create and switches to the year the server filed the topic under", async () => {
    // The server resolves the year; here it differs from the creation year on purpose.
    createTopic.mockResolvedValue({
      success: true,
      message: "",
      code: "OK",
      data: {
        ...topicsResult.data[0],
        id: "t9",
        title: "Zig",
        year: 2025,
        createdAt: "2026-10-18T12:00:00Z",
      },
    });
    render(<LearningPage />);
    // Start on a year tab: from All the new topic is already visible, so the page must not switch
    // away (covered by "stays on All"). Here the topic is filed under a different year's tab.
    fireEvent.click(screen.getByRole("tab", { name: /^2026/ }));
    const { yearSelect, titleInput, save } = await openTopicDialog(
      screen.getByRole("button", { name: "New topic" }),
    );
    fireEvent.change(titleInput, { target: { value: "Zig" } });
    fireEvent.change(yearSelect, { target: { value: "2025" } });
    expect(yearSelect.value).toBe("2025");
    save();
    await waitFor(() =>
      expect(createTopic).toHaveBeenCalledWith({ title: "Zig", description: null, year: 2025 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selectedTab()?.textContent).toContain("2025");
    expect(localStorage.getItem(YEAR_KEY)).toBe("2025");
  });

  it("shows the topic's year when editing and omits year from the body when only the title changed", async () => {
    render(<LearningPage />);
    const [rustPencil] = screen.getAllByRole("button", { name: "Edit" });
    const { yearSelect, titleInput, save } = await openTopicDialog(rustPencil);
    expect(yearSelect.value).toBe("2026");
    fireEvent.change(titleInput, { target: { value: "Rust 2024 edition" } });
    save();
    await waitFor(() => expect(updateTopic).toHaveBeenCalledTimes(1));
    const [{ id, body }] = updateTopic.mock.calls[0] as [{ id: string; body: object }];
    expect(id).toBe("t1");
    expect(body).toEqual({ title: "Rust 2024 edition", description: null });
    // Not even `year: undefined`: the server treats a missing key as "leave untouched".
    expect(Object.keys(body)).not.toContain("year");
  });

  it("includes year in the update body once the owner changes it", async () => {
    render(<LearningPage />);
    const [rustPencil] = screen.getAllByRole("button", { name: "Edit" });
    const { yearSelect, save } = await openTopicDialog(rustPencil);
    fireEvent.change(yearSelect, { target: { value: "2024" } });
    save();
    await waitFor(() =>
      expect(updateTopic).toHaveBeenCalledWith({
        id: "t1",
        body: { title: "Rust", description: null, year: 2024 },
      }),
    );
  });

  it("seeds an edit from the topic's own year, not from the tab or the clock", async () => {
    render(<LearningPage />);
    // Go is a 2025 topic edited from the All tab in 2026: a modal seeded from the tab/current year
    // would show 2026 and sneak `year` into a title-only save.
    const [, goPencil] = screen.getAllByRole("button", { name: "Edit" });
    const { yearSelect, titleInput, save } = await openTopicDialog(goPencil);
    expect(yearSelect.value).toBe("2025");
    fireEvent.change(titleInput, { target: { value: "Go 1.25" } });
    save();
    await waitFor(() => expect(updateTopic).toHaveBeenCalledTimes(1));
    const [{ id, body }] = updateTopic.mock.calls[0] as [{ id: string; body: object }];
    expect(id).toBe("t2");
    expect(body).toEqual({ title: "Go 1.25", description: null });
    expect(Object.keys(body)).not.toContain("year");
  });
});

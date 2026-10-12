import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
        subtopics: [],
        itemCount: 1,
        completedCount: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
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

afterEach(cleanup);

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
    render(<LearningPage />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /New subtopic/ }));
  });
});

describe("LearningPage item dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<LearningPage />);
    // The row is a component declared inside TopicCard's render, so it remounts when the page
    // state changes and the original trigger is gone by the time the dialog closes.
    await verifyDialogFromTrigger(screen.getByRole("button", { name: /Read the book/ }), {
      triggerUnmounts: true,
    });
  });
});

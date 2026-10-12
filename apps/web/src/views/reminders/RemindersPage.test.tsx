import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import RemindersPage from "./RemindersPage";
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

const { mutation, listsResult, remindersResult } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  listsResult: {
    data: [{ id: 1, name: "Home", color: "#007AFF", position: 0, itemCount: 1 }],
    isLoading: false,
  },
  remindersResult: {
    data: [
      {
        id: 10,
        listId: 1,
        title: "Buy milk",
        notes: null,
        dueAt: null,
        notifyMinutesBefore: null,
        completedAt: null,
        priority: "NONE",
        flag: false,
        position: 0,
      },
    ],
    isLoading: false,
  },
}));

vi.mock("@/hooks/useReminders", () => ({
  useReminderLists: () => listsResult,
  useCreateReminderList: () => mutation(),
  useUpdateReminderList: () => mutation(),
  useDeleteReminderList: () => mutation(),
  useRestoreReminderList: () => mutation(),
  useReminders: () => remindersResult,
  useCreateReminder: () => mutation(),
  useToggleReminder: () => mutation(),
  useUpdateReminder: () => mutation(),
  useDeleteReminder: () => mutation(),
  useRestoreReminder: () => mutation(),
  useReorderReminders: () => mutation(),
  useReorderReminderLists: () => mutation(),
}));

vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div>crumb</div> }));
vi.mock("@/components/ai/DictateQuickAddModal", () => ({ default: () => null }));
vi.mock("@/components/notifications/LeadTimeSelect", () => ({ default: () => <div>lead</div> }));

afterEach(cleanup);

describe("RemindersPage new list dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<RemindersPage />);
    await verifyDialogFromTrigger(screen.getAllByRole("button", { name: /reminders.newList/ })[0]);
  });

  it("closes on a plain backdrop click only", async () => {
    render(<RemindersPage />);
    await verifyBackdropCloseFromTrigger(
      screen.getAllByRole("button", { name: /reminders.newList/ })[0],
    );
  });
});

describe("RemindersPage edit reminder dialog", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    render(<RemindersPage />);
    await verifyDialogFromTrigger(screen.getByRole("button", { name: "Buy milk" }));
  });

  it("closes on a plain backdrop click only", async () => {
    render(<RemindersPage />);
    await verifyBackdropCloseFromTrigger(screen.getByRole("button", { name: "Buy milk" }));
  });
});

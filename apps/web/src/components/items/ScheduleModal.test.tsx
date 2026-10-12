import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ScheduleModal from "./ScheduleModal";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: { count?: number }) => {
        const map: Record<string, string> = {
          "today.board.scheduleModalTitle": "Schedule item",
          "today.board.timeLabel": "Time",
          "today.board.durationLabel": "Duration",
          "today.board.confirm": "Confirm",
          "today.board.cancel": "Cancel",
          "today.board.recurringTaskTooltip": "Recurring tasks cannot be scheduled directly",
          "today.board.minuteOption": `${opts?.count ?? 30} min`,
          "common.close": "Close",
        };
        return map[key] ?? key;
      },
    }),
  };
});

function renderModal(recurring: boolean) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ScheduleModal
        item={{ id: "1", title: "Plan", durationMin: 30 }}
        todayDate="2026-10-12"
        recurring={recurring}
        initialTime="10:00"
        onClose={vi.fn()}
        onScheduled={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("ScheduleModal focus handling", () => {
  it("moves focus to the close button when the item is recurring", () => {
    renderModal(true);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("keeps focus inside the read-only recurring dialog on Tab and Shift+Tab", async () => {
    const user = userEvent.setup();
    renderModal(true);
    const close = screen.getByRole("button", { name: "Close" });
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("wraps Tab from the last control to the first and Shift+Tab from the first to the last", async () => {
    const user = userEvent.setup();
    renderModal(false);
    const time = screen.getByLabelText("Time");
    const duration = screen.getByLabelText("Duration");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });

    expect(time).toHaveFocus();
    await user.tab();
    expect(duration).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(time).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});

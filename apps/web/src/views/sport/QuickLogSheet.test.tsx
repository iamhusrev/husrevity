import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import QuickLogSheet from "./QuickLogSheet";
import { makeLog } from "./sport-home.fixture";
import { trUseTranslation } from "./sport-test-i18n";
import { verifyBackdropClose, verifyDialogContract } from "@/test/dialog-contract";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return { ...actual, useTranslation: () => trUseTranslation() };
});

const { updateMutateAsync } = vi.hoisted(() => ({ updateMutateAsync: vi.fn() }));

vi.mock("@/hooks/useSport", () => ({
  useUpdateSportLog: () => ({
    mutateAsync: updateMutateAsync,
    mutate: updateMutateAsync,
    isPending: false,
  }),
}));

const log = makeLog({
  id: "log-1",
  sessionId: "run",
  executedDate: "2026-10-12",
  actualDuration: 30,
  intensity: 6,
  notes: null,
});

beforeEach(() => {
  updateMutateAsync.mockReset();
  updateMutateAsync.mockResolvedValue({ data: {} });
});

afterEach(cleanup);

describe("QuickLogSheet", () => {
  it("shows intensity as ten chips with the current value pressed, plus labelled duration and notes", () => {
    render(<QuickLogSheet log={log} sessionName="Run" onClose={() => {}} />);

    // Toggle buttons in a named group (every chip stays tabbable inside the dialog's
    // focus trap), not a radiogroup, which would need a roving tabindex.
    const group = screen.getByRole("group", { name: "Yoğunluk" });
    const chips = screen
      .getAllByRole("button", { pressed: false })
      .concat(screen.getAllByRole("button", { pressed: true }));
    expect(chips).toHaveLength(10);
    chips.sort((a, b) => Number(a.textContent) - Number(b.textContent));
    expect(chips.map((c) => c.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(group).toContainElement(chips[0]);
    expect(screen.getByRole("button", { name: "6", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);

    expect(screen.getByLabelText("Süre (dk)")).toHaveValue(30);
    expect(screen.getByLabelText("Not").tagName).toBe("TEXTAREA");
    expect(screen.getByText("Run")).toBeInTheDocument();
  });

  it("steps the duration by five minutes and never below five", () => {
    render(
      <QuickLogSheet log={{ ...log, actualDuration: 10 }} sessionName="Run" onClose={() => {}} />,
    );
    const duration = screen.getByLabelText("Süre (dk)");

    fireEvent.click(screen.getByRole("button", { name: "5 dakika artır" }));
    expect(duration).toHaveValue(15);

    fireEvent.click(screen.getByRole("button", { name: "5 dakika azalt" }));
    fireEvent.click(screen.getByRole("button", { name: "5 dakika azalt" }));
    expect(duration).toHaveValue(5);
    fireEvent.click(screen.getByRole("button", { name: "5 dakika azalt" }));
    expect(duration).toHaveValue(5);
  });

  it("saves intensity, duration and note through the update mutation and closes", async () => {
    const onClose = vi.fn();
    render(<QuickLogSheet log={log} sessionName="Run" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "8" }));
    expect(screen.getByRole("button", { name: "8", pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5 dakika artır" }));
    fireEvent.change(screen.getByLabelText("Not"), { target: { value: "iyi geçti" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "log-1",
        body: { intensity: 8, actualDuration: 35, notes: "iyi geçti" },
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("clamps a typed duration to the five minute floor when saving", async () => {
    render(<QuickLogSheet log={log} sessionName="Run" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Süre (dk)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "log-1",
        body: { intensity: 6, actualDuration: 5, notes: null },
      }),
    );
  });

  it("sends null for an empty note", async () => {
    render(<QuickLogSheet log={{ ...log, notes: "x" }} sessionName="Run" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Not"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "log-1",
        body: { intensity: 6, actualDuration: 30, notes: null },
      }),
    );
  });
});

describe("QuickLogSheet dialog behaviour", () => {
  it("is a modal dialog with a focus trap, Escape close and focus restore", async () => {
    await verifyDialogContract((open, onClose) =>
      open ? <QuickLogSheet log={log} sessionName="Run" onClose={onClose} /> : null,
    );
  });

  it("closes on a plain backdrop click only", async () => {
    await verifyBackdropClose((open, onClose) =>
      open ? <QuickLogSheet log={log} sessionName="Run" onClose={onClose} /> : null,
    );
  });
});

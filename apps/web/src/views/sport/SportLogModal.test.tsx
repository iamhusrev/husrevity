import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import SportLogModal from "./SportLogModal";
import type { SportLogResponse } from "@/types/sport/sport";

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

const { mutation, deleteMutateAsync } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  deleteMutateAsync: vi.fn(),
}));

vi.mock("@/hooks/useSport", () => ({
  useCreateSportLog: () => mutation(),
  useUpdateSportLog: () => mutation(),
  useDeleteSportLog: () => ({ mutateAsync: deleteMutateAsync, mutate: vi.fn(), isPending: false }),
}));

const existingLog: SportLogResponse = {
  id: "log-1",
  sessionId: null,
  executedDate: "2026-10-12",
  actualDuration: 25,
  completed: true,
  intensity: 5,
  notes: null,
  caloriesBurned: null,
  createdAt: "2026-10-12T10:00:00Z",
};

beforeEach(() => {
  deleteMutateAsync.mockReset();
  deleteMutateAsync.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("SportLogModal delete confirmation", () => {
  it("asks for confirmation and does not delete when cancelled", async () => {
    render(<SportLogModal initial={existingLog} sessionOptions={[]} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete log");
    expect(deleteMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deleteMutateAsync).not.toHaveBeenCalled();
  });

  it("deletes and closes only after the confirmation", async () => {
    const onClose = vi.fn();
    render(<SportLogModal initial={existingLog} sessionOptions={[]} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "dataTable.delete" }));

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith("log-1"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("SportLogModal session selection", () => {
  it("pre-fills the duration with the chosen session's planned duration", () => {
    render(
      <SportLogModal
        initial={null}
        sessionOptions={[
          { id: "s1", label: "Program — Easy Run", plannedDuration: 45 },
          { id: "s2", label: "Program — Yoga", plannedDuration: 60 },
        ]}
        onClose={() => {}}
      />,
    );

    const duration = screen.getByLabelText("Süre (dk)") as HTMLInputElement;
    expect(duration.value).toBe("30");

    fireEvent.change(screen.getByLabelText("Seans"), { target: { value: "s1" } });
    expect(duration.value).toBe("45");

    fireEvent.change(screen.getByLabelText("Seans"), { target: { value: "s2" } });
    expect(duration.value).toBe("60");
  });
});

describe("SportLogModal accessibility", () => {
  it("associates every label with its control", () => {
    render(
      <SportLogModal
        initial={null}
        sessionOptions={[{ id: "s1", label: "Program — Easy Run" }]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByLabelText("Seans").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Tarih")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Süre (dk)")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText(/Yoğunluk/)).toHaveAttribute("type", "range");
    expect(screen.getByLabelText("Yakılan kalori (opsiyonel)")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Not").tagName).toBe("TEXTAREA");
  });
});

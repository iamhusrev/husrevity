import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import IcsExportCard from "./IcsExportCard";
import { alertStore } from "@/stores/alert-store";

const exportItemsIcs = vi.fn();
vi.mock("@/services/item-service", () => ({
  exportItemsIcs: (...args: unknown[]) => exportItemsIcs(...args),
}));
const downloadBlob = vi.fn();
vi.mock("@/utils/download", () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) =>
        opts ? `${key}${JSON.stringify(opts)}` : key,
      i18n: { language: "en" },
    }),
  };
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IcsExportCard />
    </QueryClientProvider>,
  );
}

describe("IcsExportCard", () => {
  let showSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    showSpy = vi.spyOn(alertStore.getState(), "show");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("defaults to the first and last day of the current Istanbul month", () => {
    renderCard();
    expect(screen.getByLabelText("integrations.ics.from")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("integrations.ics.to")).toHaveValue("2026-10-31");
  });

  it("uses the Istanbul month even when the browser is still in the previous month", () => {
    // 21:30 UTC on Sep 30 is already 00:30 on Oct 1 in Istanbul.
    vi.setSystemTime(new Date("2026-09-30T21:30:00Z"));
    renderCard();
    expect(screen.getByLabelText("integrations.ics.from")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("integrations.ics.to")).toHaveValue("2026-10-31");
  });

  it("ends a leap February on the 29th", () => {
    vi.setSystemTime(new Date("2028-02-10T10:00:00Z"));
    renderCard();
    expect(screen.getByLabelText("integrations.ics.to")).toHaveValue("2028-02-29");
  });

  it("includes tasks by default and can opt out", async () => {
    exportItemsIcs.mockResolvedValue({ blob: new Blob(["x"]), filename: "a.ics" });
    const user = userEvent.setup();
    renderCard();
    const checkbox = screen.getByLabelText("integrations.ics.includeTasks");
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "integrations.ics.download" }));
    await waitFor(() => expect(exportItemsIcs).toHaveBeenCalled());
    expect(exportItemsIcs).toHaveBeenCalledWith({
      from: "2026-10-01",
      to: "2026-10-31",
      includeTasks: false,
    });
  });

  it("downloads the file with the server name and shows a success toast", async () => {
    const blob = new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" });
    exportItemsIcs.mockResolvedValue({ blob, filename: "husrevity-2026-10-01_2026-10-31.ics" });
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "integrations.ics.download" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(downloadBlob).toHaveBeenCalledWith("husrevity-2026-10-01_2026-10-31.ics", blob);
    expect(showSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("raises exactly one error alert on failure and does not download", async () => {
    exportItemsIcs.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "integrations.ics.download" }));
    await waitFor(() => expect(showSpy).toHaveBeenCalled());
    const errors = showSpy.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type?: string }).type === "error",
    );
    expect(errors).toHaveLength(1);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("disables the button while pending so a second click is ignored", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    exportItemsIcs.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderCard();
    const button = screen.getByRole("button", { name: "integrations.ics.download" });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(exportItemsIcs).toHaveBeenCalledTimes(1);
    resolve({ blob: new Blob(["x"]), filename: "a.ics" });
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
  });

  it("rejects an end before the start and does not call the API", async () => {
    const user = userEvent.setup();
    renderCard();
    const to = screen.getByLabelText("integrations.ics.to");
    fireEvent.change(to, { target: { value: "2026-09-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("integrations.ics.errors.endBeforeStart");
    const button = screen.getByRole("button", { name: "integrations.ics.download" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(exportItemsIcs).not.toHaveBeenCalled();
  });

  it("accepts a 366-day range and rejects 367 days (leap year, real dates)", () => {
    renderCard();
    const from = screen.getByLabelText("integrations.ics.from");
    const to = screen.getByLabelText("integrations.ics.to");
    fireEvent.change(from, { target: { value: "2028-01-01" } });
    fireEvent.change(to, { target: { value: "2028-12-31" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "integrations.ics.download" })).toBeEnabled();

    fireEvent.change(to, { target: { value: "2029-01-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("integrations.ics.errors.tooLong");
    expect(screen.getByRole("button", { name: "integrations.ics.download" })).toBeDisabled();
  });

  it("treats an empty date as invalid", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("integrations.ics.from"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("integrations.ics.errors.invalid");
    expect(screen.getByRole("button", { name: "integrations.ics.download" })).toBeDisabled();
  });

  it("explains that completed occurrences of recurring items still appear externally", () => {
    renderCard();
    expect(screen.getByText("integrations.ics.note")).toBeInTheDocument();
  });
});

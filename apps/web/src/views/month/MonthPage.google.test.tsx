import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import MonthPage from "./MonthPage";
import * as useItemsModule from "@/hooks/useItems";
import { integrationsService } from "@/services/integrations-service";
import {
  CONNECTED_V2,
  createWrapper,
  makeGoogleEvent,
  makeItem,
  translate,
} from "./google-calendar-ui.shared";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: translate, i18n: { language: "tr" } }),
  };
});

function mockItems(data: ReturnType<typeof makeItem>[]) {
  vi.spyOn(useItemsModule, "useItemsInRange").mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

describe("MonthPage google feed", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calendar_merges_and_is_read_only", async () => {
    mockItems([
      makeItem({ id: "own", title: "Own Event", scheduledAt: "2026-10-12T10:00:00+03:00" }),
    ]);
    vi.spyOn(integrationsService, "googleStatus").mockResolvedValue(CONNECTED_V2);
    const feed = vi.spyOn(integrationsService, "googleEvents").mockResolvedValue({
      hiddenLegacyItemIds: [],
      events: [
        makeGoogleEvent({
          id: "g-all",
          title: "Holiday",
          allDay: true,
          startDate: "2026-10-12",
          endDateExclusive: "2026-10-13",
        }),
      ],
    });

    render(<MonthPage initialYear={2026} initialMonth={10} />, { wrapper: createWrapper() });

    const chip = await screen.findByLabelText("Google event: Holiday");
    const cell12 = screen.getByTestId("cell-2026-10-12");
    expect(within(cell12).getByText("Own Event")).toBeInTheDocument();
    expect(within(cell12).getByLabelText("Google event: Holiday")).toBe(chip);
    // Read-only: no actions, not draggable, and not on the next day (exclusive end).
    expect(within(chip).queryAllByRole("button")).toHaveLength(0);
    expect(chip.getAttribute("data-draggable")).toBe("false");
    expect(within(screen.getByTestId("cell-2026-10-13")).queryByText("Holiday")).toBeNull();
    expect(chip.textContent).not.toMatch(/03:00/);
    expect(feed).toHaveBeenCalledTimes(1);
  });

  it("hides only the legacy gcal items the feed lists", async () => {
    mockItems([
      makeItem({ id: "legacy", title: "Legacy Copy", source: "gcal", scheduledAt: "2026-10-12T10:00:00+03:00" }),
      makeItem({ id: "keep-gcal", title: "Kept Gcal", source: "gcal", scheduledAt: "2026-10-12T11:00:00+03:00" }),
      makeItem({ id: "web-same-id", title: "Web Item", scheduledAt: "2026-10-12T12:00:00+03:00" }),
    ]);
    vi.spyOn(integrationsService, "googleStatus").mockResolvedValue(CONNECTED_V2);
    vi.spyOn(integrationsService, "googleEvents").mockResolvedValue({
      events: [],
      hiddenLegacyItemIds: ["legacy", "web-same-id"],
    });

    render(<MonthPage initialYear={2026} initialMonth={10} />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.queryByText("Legacy Copy")).toBeNull());
    expect(screen.getByText("Kept Gcal")).toBeInTheDocument();
    expect(screen.getByText("Web Item")).toBeInTheDocument();
  });

  it("google_feed_failure_keeps_items", async () => {
    mockItems([
      makeItem({ id: "own", title: "Own Event", scheduledAt: "2026-10-12T10:00:00+03:00" }),
    ]);
    vi.spyOn(integrationsService, "googleStatus").mockResolvedValue(CONNECTED_V2);
    vi.spyOn(integrationsService, "googleEvents").mockRejectedValue(new Error("boom"));

    render(<MonthPage initialYear={2026} initialMonth={10} />, { wrapper: createWrapper() });

    expect(await screen.findByTestId("google-feed-error")).toHaveTextContent("Google feed failed");
    expect(screen.getByText("Own Event")).toBeInTheDocument();
  });

  it("makes no google request when v2 is disabled", async () => {
    mockItems([makeItem({ id: "own", title: "Own Event", scheduledAt: "2026-10-12T10:00:00+03:00" })]);
    const status = vi
      .spyOn(integrationsService, "googleStatus")
      .mockResolvedValue({ ...CONNECTED_V2, v2Enabled: false });
    const feed = vi.spyOn(integrationsService, "googleEvents").mockResolvedValue({
      events: [],
      hiddenLegacyItemIds: [],
    });

    render(<MonthPage initialYear={2026} initialMonth={10} />, { wrapper: createWrapper() });

    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(screen.getByText("Own Event")).toBeInTheDocument();
    expect(feed).not.toHaveBeenCalled();
    expect(screen.queryByTestId("google-feed-error")).toBeNull();
  });
});

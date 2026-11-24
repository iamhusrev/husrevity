import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import WeekPage from "./WeekPage";
import * as useItemsModule from "@/hooks/useItems";
import { integrationsService } from "@/services/integrations-service";
import {
  CONNECTED_V2,
  createWrapper,
  makeGoogleEvent,
  makeItem,
  translate,
} from "@/views/month/google-calendar-ui.shared";

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

// Week Mon 2026-10-12 .. Sun 2026-10-18, today Wed 2026-10-14 (Istanbul).
describe("WeekPage google feed", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
    vi.spyOn(useItemsModule, "useCompleteItem").mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.spyOn(useItemsModule, "useCreateItem").mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calendar_merges_and_is_read_only", async () => {
    mockItems([makeItem({ id: "own", title: "Own Event", scheduledAt: "2026-10-12T10:00:00+03:00" })]);
    vi.spyOn(integrationsService, "googleStatus").mockResolvedValue(CONNECTED_V2);
    vi.spyOn(integrationsService, "googleEvents").mockResolvedValue({
      hiddenLegacyItemIds: [],
      events: [
        makeGoogleEvent({
          id: "g-multi",
          title: "Trip",
          allDay: true,
          startDate: "2026-10-12",
          endDateExclusive: "2026-10-14",
        }),
        makeGoogleEvent({
          id: "g-timed",
          title: "Call",
          startAt: "2026-10-15T11:00:00Z",
          endAt: "2026-10-15T12:00:00Z",
        }),
      ],
    });

    render(<WeekPage />, { wrapper: createWrapper() });

    await screen.findAllByLabelText("Google event: Trip");
    expect(within(screen.getByTestId("week-day-2026-10-12")).getByText("Own Event")).toBeInTheDocument();
    // Two-day all-day span: Mon and Tue, not Wed (exclusive end).
    expect(within(screen.getByTestId("week-day-2026-10-12")).getByLabelText("Google event: Trip")).toBeInTheDocument();
    expect(within(screen.getByTestId("week-day-2026-10-13")).getByLabelText("Google event: Trip")).toBeInTheDocument();
    expect(within(screen.getByTestId("week-day-2026-10-14")).queryByLabelText("Google event: Trip")).toBeNull();
    const call = within(screen.getByTestId("week-day-2026-10-15")).getByLabelText("Google event: Call");
    expect(call.textContent).toContain("14:00");
    for (const chip of screen.getAllByLabelText(/^Google event:/)) {
      expect(within(chip).queryAllByRole("button")).toHaveLength(0);
      expect(chip.getAttribute("data-draggable")).toBe("false");
    }
  });

  it("google_feed_failure_keeps_items", async () => {
    mockItems([makeItem({ id: "own", title: "Own Event", scheduledAt: "2026-10-12T10:00:00+03:00" })]);
    vi.spyOn(integrationsService, "googleStatus").mockResolvedValue(CONNECTED_V2);
    vi.spyOn(integrationsService, "googleEvents").mockRejectedValue(new Error("boom"));

    render(<WeekPage />, { wrapper: createWrapper() });

    expect(await screen.findByTestId("google-feed-error")).toBeInTheDocument();
    expect(screen.getByText("Own Event")).toBeInTheDocument();
  });

  it("makes no google request when v2 is disabled", async () => {
    mockItems([makeItem({ id: "own", title: "Own Event", scheduledAt: "2026-10-12T10:00:00+03:00" })]);
    const status = vi
      .spyOn(integrationsService, "googleStatus")
      .mockResolvedValue({ ...CONNECTED_V2, v2Enabled: false });
    const feed = vi.spyOn(integrationsService, "googleEvents").mockResolvedValue({ events: [], hiddenLegacyItemIds: [] });

    render(<WeekPage />, { wrapper: createWrapper() });

    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(screen.getByText("Own Event")).toBeInTheDocument();
    expect(feed).not.toHaveBeenCalled();
  });

  it("hides only the legacy gcal items the feed lists", async () => {
    mockItems([
      makeItem({ id: "legacy", title: "Legacy Copy", source: "gcal", scheduledAt: "2026-10-12T10:00:00+03:00" }),
      makeItem({ id: "web", title: "Web Item", scheduledAt: "2026-10-12T12:00:00+03:00" }),
    ]);
    vi.spyOn(integrationsService, "googleStatus").mockResolvedValue(CONNECTED_V2);
    vi.spyOn(integrationsService, "googleEvents").mockResolvedValue({ events: [], hiddenLegacyItemIds: ["legacy", "web"] });

    render(<WeekPage />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.queryByText("Legacy Copy")).toBeNull());
    expect(screen.getByText("Web Item")).toBeInTheDocument();
  });
});

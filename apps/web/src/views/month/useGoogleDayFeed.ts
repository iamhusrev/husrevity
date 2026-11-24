import { useMemo } from "react";
import { useGoogleEvents } from "@/hooks/useGoogleCalendars";
import { slotToIso } from "@/utils/today-board";
import { groupGoogleEventsByDay } from "./merge-google-events";

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Google feed for the visible [fromYmd, toYmd] days, grouped per day. Never blocks the items. */
export function useGoogleDayFeed(fromYmd: string, toYmd: string) {
  const from = slotToIso(fromYmd, 0);
  const to = slotToIso(nextDay(toYmd), 0);
  const { events, hiddenLegacyItemIds, isError } = useGoogleEvents(from, to);
  const googleByDay = useMemo(() => groupGoogleEventsByDay(events), [events]);
  return { googleByDay, hiddenLegacyItemIds, feedError: isError };
}

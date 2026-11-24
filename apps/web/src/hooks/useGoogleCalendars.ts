import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsService, GoogleFeed } from "@/services/integrations-service";
import { showErrorAlert } from "@/utils/mutation-error";

export const GOOGLE_STATUS_KEY = ["integrations", "google"] as const;
const GOOGLE_CALENDARS_KEY = ["integrations", "google", "calendars"] as const;

/** Same query as the connect/disconnect card, so both share one cache entry. */
export function useGoogleStatus() {
  return useQuery({
    queryKey: GOOGLE_STATUS_KEY,
    queryFn: integrationsService.googleStatus,
  });
}

/** The user's Google calendars with the saved selection. Only runs once the section is visible. */
export function useGoogleCalendars(enabled: boolean) {
  return useQuery({
    queryKey: GOOGLE_CALENDARS_KEY,
    queryFn: integrationsService.googleCalendars,
    enabled,
  });
}

/** Saves the selection, then refreshes the list and the status (selected count, last sync). */
export function useSaveGoogleSelection(options?: { onSaved?: () => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (selected: string[]) => integrationsService.googleSaveSelection(selected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOOGLE_CALENDARS_KEY });
      qc.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY, exact: true });
      options?.onSaved?.();
    },
    onError: showErrorAlert,
  });
}

const NO_EVENTS: GoogleFeed = { events: [], hiddenLegacyItemIds: [] };

/**
 * The Google feed for [from, to) (ISO instants). Runs only when the status reports v2 enabled and
 * connected; otherwise no request is made and the feed is empty. A failure never throws to callers.
 */
export function useGoogleEvents(from: string, to: string) {
  const status = useGoogleStatus();
  const enabled = Boolean(status.data?.v2Enabled && status.data?.connected);
  const query = useQuery({
    queryKey: [...GOOGLE_CALENDARS_KEY, "events", from, to] as const,
    queryFn: () => integrationsService.googleEvents(from, to),
    enabled,
    retry: false,
  });
  return {
    events: query.data?.events ?? NO_EVENTS.events,
    hiddenLegacyItemIds: query.data?.hiddenLegacyItemIds ?? NO_EVENTS.hiddenLegacyItemIds,
    isError: enabled && query.isError,
  };
}

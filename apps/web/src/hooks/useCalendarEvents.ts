import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarService, EventRangeFilter } from "@/services/calendar-service";
import { EventRequest } from "@/types/calendar/calendar-event";

const EVENT_KEYS = {
  all: ["calendar-events"] as const,
  range: (filter: EventRangeFilter) =>
    ["calendar-events", filter.from ?? "", filter.to ?? ""] as const,
  detail: (id: number) => ["calendar-event", id] as const,
};

export function useCalendarEvents(filter: EventRangeFilter) {
  return useQuery({
    queryKey: EVENT_KEYS.range(filter),
    queryFn: () => calendarService.listEvents(filter),
    select: (d) => d.data,
    enabled: !!filter.from && !!filter.to,
  });
}

export function useCalendarEvent(id: number) {
  return useQuery({
    queryKey: EVENT_KEYS.detail(id),
    queryFn: () => calendarService.getEvent(id),
    select: (d) => d.data,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EventRequest) => calendarService.createEvent(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENT_KEYS.all }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: EventRequest }) =>
      calendarService.updateEvent(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: EVENT_KEYS.all });
      qc.invalidateQueries({ queryKey: EVENT_KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => calendarService.deleteEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENT_KEYS.all }),
  });
}

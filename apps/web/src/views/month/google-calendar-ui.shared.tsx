import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleFeedEvent, GoogleStatus } from "@/services/integrations-service";
import { ItemResponse } from "@/types/item/item";

export function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

export const TEMPLATES: Record<string, string> = {
  "calendar.googleEventLabel": "Google event: {{title}}",
  "calendar.googleBadge": "Google",
  "calendar.googleFeedError": "Google feed failed",
};

export function translate(key: string, opts?: Record<string, unknown>): string {
  const tpl = TEMPLATES[key] ?? key;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? ""));
}

export const CONNECTED_V2: GoogleStatus = {
  configured: true,
  connected: true,
  connectedAt: null,
  v2Enabled: true,
};

export function makeItem(overrides: Partial<ItemResponse>): ItemResponse {
  return {
    id: "item",
    kind: "event",
    title: "Item",
    notes: null,
    context: null,
    projectId: null,
    blockId: null,
    scheduledAt: null,
    durationMin: null,
    dueAt: null,
    notifyMinutesBefore: null,
    rrule: null,
    status: "open",
    completedAt: null,
    payload: {},
    source: "web",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

export function makeGoogleEvent(overrides: Partial<GoogleFeedEvent>): GoogleFeedEvent {
  return {
    id: "ge1",
    subscriptionId: "s1",
    googleEventId: "g1",
    recurringEventId: null,
    title: "Google Event",
    allDay: false,
    startAt: null,
    endAt: null,
    startDate: null,
    endDateExclusive: null,
    status: "confirmed",
    htmlLink: null,
    ...overrides,
  };
}

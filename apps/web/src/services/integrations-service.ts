import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  GOOGLE_CALENDAR_VERIFIER_STORAGE_KEY as VERIFIER_KEY,
  beginPkce,
  clearVerifier,
} from "@/utils/google-pkce";

export interface LinkStatus {
  configured: boolean;
  linked: boolean;
  botUsername: string | null;
  linkedAt: string | null;
  pendingCode: string | null;
  pendingCodeExpiresAt: string | null;
}

export interface LinkCode {
  code: string;
  botUsername: string | null;
  expiresAt: string;
}

export type GoogleCalendarMode = "legacy" | "v2_read" | "narrowed";

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  /** The fields below are additive; an older API omits them (treat as v2 unavailable). */
  v2Enabled?: boolean;
  mode?: GoogleCalendarMode;
  needsReconnect?: boolean;
  selectedCount?: number;
  lastSyncAt?: string | null;
  /** Sanitized by the API, never a token. */
  lastError?: string | null;
  /** Optional write-back to Google (default off). */
  writeEnabled?: boolean;
  /** A disconnect could not revoke the Google grant after all retries: it may still be active in the user's Google Account. */
  revokeFailed?: boolean;
  /** Legacy sync is paused (flag off and a narrowed grant): nothing syncs, cached data stays. */
  paused?: boolean;
}

/** Result of `PUT /integrations/google-calendar/write`. */
export interface GoogleWriteResult {
  enabled: boolean;
  /** API start URL of the extra-permission consent; the browser must navigate to it. */
  consentUrl: string | null;
}

/** Result of the explicit "Move to new calendar" action. `remaining` counts events still to publish. */
export interface GoogleMigrateResult {
  published: number;
  skipped: number;
  failed: number;
  remaining: number;
}

/** One Google calendar of the picker. `managed` is the calendar Husrevity publishes into (not selectable). */
export interface GoogleCalendarChoice {
  id: string;
  summary: string;
  backgroundColor: string | null;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary: boolean;
  selected: boolean;
  managed: boolean;
}

/** One Google event of the web feed (title and timing only). All-day events use date strings. */
export interface GoogleFeedEvent {
  id: string;
  subscriptionId: string;
  googleEventId: string;
  recurringEventId: string | null;
  title: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  /** 'YYYY-MM-DD', exclusive: a one-day event on the 10th ends on the 11th. */
  endDateExclusive: string | null;
  status: string;
  htmlLink: string | null;
}

export interface GoogleFeed {
  events: GoogleFeedEvent[];
  hiddenLegacyItemIds: string[];
}

export type PatScope =
  | "items:read"
  | "items:write"
  | "notes:read"
  | "notes:write"
  | "projects:read"
  | "projects:write"
  | "calendar:read"
  | "calendar:write"
  | "reminders:read"
  | "reminders:write"
  | "routine:read"
  | "routine:write"
  | "timeblocks:read"
  | "timeblocks:write"
  | "learning:read"
  | "learning:write"
  | "sport:read"
  | "sport:write"
  | "notifications:read"
  | "notifications:write"
  | "goals:read"
  | "goals:write";

export const PAT_SCOPES: PatScope[] = [
  "items:read",
  "items:write",
  "notes:read",
  "notes:write",
  "projects:read",
  "projects:write",
  "calendar:read",
  "calendar:write",
  "reminders:read",
  "reminders:write",
  "routine:read",
  "routine:write",
  "timeblocks:read",
  "timeblocks:write",
  "learning:read",
  "learning:write",
  "sport:read",
  "sport:write",
  "notifications:read",
  "notifications:write",
  "goals:read",
  "goals:write",
];

export interface Pat {
  id: string;
  name: string;
  scopes: PatScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export type ChatProvider = "telegram" | "slack";

/** Result of `POST /integrations/google-calendar/exchange`. */
export interface GoogleExchangeResult {
  kind: "connect" | "narrow" | "write";
  connected: boolean;
}

/**
 * Every Google Calendar consent (connect, narrow, enable write) starts by
 * keeping a fresh PKCE verifier in sessionStorage and sending only its
 * challenge. The tokens are stored by the final exchange, and only for the
 * browser session that holds the verifier. A failed start leaves no verifier behind.
 */
async function withCalendarPkce<T>(start: (challenge: string) => Promise<T>): Promise<T> {
  const { challenge } = await beginPkce(VERIFIER_KEY);
  try {
    return await start(challenge);
  } catch (error) {
    clearVerifier(VERIFIER_KEY);
    throw error;
  }
}

export const integrationsService = {
  async linkStatus(provider: ChatProvider): Promise<LinkStatus> {
    const res = await apiClient.get<ApiResponse<LinkStatus>>(`/${provider}/status`);
    return res.data.data;
  },
  async createLinkCode(provider: ChatProvider): Promise<LinkCode> {
    const res = await apiClient.post<ApiResponse<LinkCode>>(`/${provider}/link-code`);
    return res.data.data;
  },
  async unlink(provider: ChatProvider): Promise<void> {
    await apiClient.delete(`/${provider}/link`);
  },

  async googleStatus(): Promise<GoogleStatus> {
    const res = await apiClient.get<ApiResponse<GoogleStatus>>(
      "/integrations/google-calendar/status",
    );
    return res.data.data;
  },
  async googleConnectUrl(): Promise<string> {
    return withCalendarPkce(async (codeChallenge) => {
      const res = await apiClient.get<ApiResponse<{ url: string }>>(
        "/integrations/google-calendar/connect-url",
        { params: { codeChallenge } },
      );
      return res.data.data.url;
    });
  },
  /** Redeems the single-use handoff code from the callback fragment with the stored PKCE verifier. */
  async googleExchange(code: string, verifier: string): Promise<GoogleExchangeResult> {
    const res = await apiClient.post<ApiResponse<GoogleExchangeResult>>(
      "/integrations/google-calendar/exchange",
      { code, verifier },
    );
    return res.data.data;
  },
  async googleCalendars(): Promise<GoogleCalendarChoice[]> {
    const res = await apiClient.get<ApiResponse<GoogleCalendarChoice[]>>(
      "/integrations/google-calendar/calendars",
    );
    return res.data.data;
  },
  async googleSaveSelection(selected: string[]): Promise<{ selected: string[] }> {
    const res = await apiClient.put<ApiResponse<{ selected: string[] }>>(
      "/integrations/google-calendar/calendars/selection",
      { selected },
    );
    return res.data.data;
  },
  async googleEvents(from: string, to: string): Promise<GoogleFeed> {
    const res = await apiClient.get<ApiResponse<GoogleFeed>>(
      "/integrations/google-calendar/events",
      { params: { from, to } },
    );
    return res.data.data;
  },
  /** Revokes the current Google grant and returns the API start URL of the read-only consent. */
  async googleNarrowUrl(): Promise<string> {
    return withCalendarPkce(async (codeChallenge) => {
      const res = await apiClient.post<ApiResponse<{ url: string }>>(
        "/integrations/google-calendar/narrow",
        { codeChallenge },
      );
      return res.data.data.url;
    });
  },
  /** Turns the optional write-back on or off. Turning it on may answer a consent URL to open. */
  async googleSetWrite(enabled: boolean): Promise<GoogleWriteResult> {
    if (!enabled) {
      const res = await apiClient.put<ApiResponse<GoogleWriteResult>>(
        "/integrations/google-calendar/write",
        { enabled },
      );
      return res.data.data;
    }
    const result = await withCalendarPkce(async (codeChallenge) => {
      const res = await apiClient.put<ApiResponse<GoogleWriteResult>>(
        "/integrations/google-calendar/write",
        { enabled, codeChallenge },
      );
      return res.data.data;
    });
    // No consent needed (already granted): the verifier would never be used.
    if (!result.consentUrl) clearVerifier(VERIFIER_KEY);
    return result;
  },
  /** Explicitly publishes the user's existing personal events to the new Google calendar. */
  async googleMigrateLegacy(): Promise<GoogleMigrateResult> {
    const res = await apiClient.post<ApiResponse<GoogleMigrateResult>>(
      "/integrations/google-calendar/write/migrate-legacy",
    );
    return res.data.data;
  },
  /** How many legacy Google copies exist. Works in every mode, also after a disconnect. */
  async googleLegacyCopies(): Promise<{ legacyCopyCount: number }> {
    const res = await apiClient.get<ApiResponse<{ legacyCopyCount: number }>>(
      "/integrations/google-calendar/legacy-copies",
    );
    return res.data.data;
  },
  /** Permanently deletes the legacy Google copies (the explicit `confirm: true` is always sent). */
  async googleLegacyCopiesPurge(): Promise<{ deleted: number }> {
    const res = await apiClient.post<ApiResponse<{ deleted: number }>>(
      "/integrations/google-calendar/legacy-copies/purge",
      { confirm: true },
    );
    return res.data.data;
  },
  /** `deleteLegacyCopies` is sent only when true (the explicit confirmation). */
  async googleDisconnect(deleteLegacyCopies = false): Promise<void> {
    await apiClient.delete("/integrations/google-calendar", {
      params: deleteLegacyCopies === true ? { deleteLegacyCopies: true } : undefined,
    });
  },

  async listPats(): Promise<Pat[]> {
    const res = await apiClient.get<ApiResponse<Pat[]>>("/pat");
    return res.data.data;
  },
  async issuePat(name: string, scopes: PatScope[]): Promise<{ id: string; token: string }> {
    const res = await apiClient.post<ApiResponse<{ id: string; token: string }>>("/pat", {
      name,
      scopes,
    });
    return res.data.data;
  },
  async revokePat(id: string): Promise<void> {
    await apiClient.delete(`/pat/${id}`);
  },
};

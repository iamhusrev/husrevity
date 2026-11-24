import { Injectable } from '@nestjs/common';
import { GoogleCalendarConfig } from './google-calendar.config';
import { GoogleCalendarService } from './google-calendar.service';

/** Injection token for the Google calendar-management gateway (swapped for the fake in tests). */
export const GOOGLE_CALENDAR_GATEWAY = 'GOOGLE_CALENDAR_GATEWAY';

export type GoogleAccessRole = 'owner' | 'writer' | 'reader' | 'freeBusyReader';

/** One entry of the user's Google `calendarList`, reduced to what the selection screen needs. */
export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor: string | null;
  accessRole: GoogleAccessRole;
  primary: boolean;
}

export interface GoogleWatchRequest {
  calendarId: string;
  channelId: string;
  address: string;
  /** Raw channel token. Handed to Google once, never stored or logged (only its hash is persisted). */
  token: string;
}

export interface GoogleWatchResult {
  resourceId: string;
  expiresAt: Date;
}

/** The minimal event body Husrevity writes to Google: title and time only (data minimisation). */
export interface GoogleEventWrite {
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  /** Always `confirmed` so a patch also restores an event the user deleted in Google. */
  status: 'confirmed';
}

export interface GoogleWrittenEvent {
  id: string;
  etag: string | null;
}

export interface GoogleCreateCalendarRequest {
  summary: string;
  timeZone: string;
}

/**
 * Calendar-management surface of Google needed by the selection flow
 * (listing calendars and push channels). Event reads live in GoogleEventsReader.
 */
export interface GoogleCalendarGateway {
  listCalendars(ownerId: string): Promise<GoogleCalendarListEntry[]>;
  watchEvents(ownerId: string, request: GoogleWatchRequest): Promise<GoogleWatchResult>;
  stopChannel(ownerId: string, channelId: string, resourceId: string): Promise<void>;
  /**
   * Revokes a Google OAuth token (a refresh token revokes the whole grant).
   * Takes the token itself because disconnect and narrowing revoke before or
   * after the stored account changes state. Never log the value.
   */
  revokeToken(token: string): Promise<void>;

  /** calendars.insert: creates a secondary calendar owned by the app (scope `calendar.app.created`). */
  createCalendar(ownerId: string, request: GoogleCreateCalendarRequest): Promise<{ id: string }>;
  /** events.insert with a caller-chosen id. Throws an error whose status is 409 when the id already exists. */
  insertEvent(ownerId: string, calendarId: string, eventId: string, event: GoogleEventWrite): Promise<GoogleWrittenEvent>;
  /** events.patch. Throws status 404 when the event does not exist (or is gone for good). */
  patchEvent(ownerId: string, calendarId: string, eventId: string, event: GoogleEventWrite): Promise<GoogleWrittenEvent>;
  /** events.delete. Throws status 404 or 410 when the event is already gone. */
  deleteEvent(ownerId: string, calendarId: string, eventId: string): Promise<void>;
}

const MAX_LIST_PAGES = 10;
const DEFAULT_CHANNEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES: GoogleAccessRole[] = ['owner', 'writer', 'reader', 'freeBusyReader'];

/** Production gateway: googleapis client built from the owner's stored tokens. */
@Injectable()
export class GoogleApiCalendarGateway implements GoogleCalendarGateway {
  constructor(
    private readonly gcal: GoogleCalendarService,
    private readonly config: GoogleCalendarConfig,
  ) {}

  async listCalendars(ownerId: string): Promise<GoogleCalendarListEntry[]> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    const out: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const res = await calendar.calendarList.list({ pageToken, maxResults: 250 });
      for (const item of res.data.items ?? []) {
        if (!item.id) continue;
        const role = ROLES.find((r) => r === item.accessRole) ?? 'reader';
        out.push({
          id: item.id,
          summary: item.summaryOverride || item.summary || item.id,
          backgroundColor: item.backgroundColor ?? null,
          accessRole: role,
          primary: item.primary === true,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
    return out;
  }

  async watchEvents(ownerId: string, req: GoogleWatchRequest): Promise<GoogleWatchResult> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    const res = await calendar.events.watch({
      calendarId: req.calendarId,
      requestBody: { id: req.channelId, type: 'web_hook', address: req.address, token: req.token },
    });
    if (!res.data.resourceId) throw new Error('Google returned no resource id for the channel');
    return {
      resourceId: res.data.resourceId,
      expiresAt: res.data.expiration
        ? new Date(Number(res.data.expiration))
        : new Date(Date.now() + DEFAULT_CHANNEL_TTL_MS),
    };
  }

  async stopChannel(ownerId: string, channelId: string, resourceId: string): Promise<void> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    await calendar.channels.stop({ requestBody: { id: channelId, resourceId } });
  }

  async revokeToken(token: string): Promise<void> {
    await this.config.createOAuth2Client().revokeToken(token);
  }

  async createCalendar(ownerId: string, req: GoogleCreateCalendarRequest): Promise<{ id: string }> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    const res = await calendar.calendars.insert({ requestBody: { summary: req.summary, timeZone: req.timeZone } });
    if (!res.data.id) throw new Error('Google returned no calendar id');
    return { id: res.data.id };
  }

  async insertEvent(
    ownerId: string,
    calendarId: string,
    eventId: string,
    event: GoogleEventWrite,
  ): Promise<GoogleWrittenEvent> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    const res = await calendar.events.insert({ calendarId, requestBody: { ...event, id: eventId } });
    return { id: res.data.id ?? eventId, etag: res.data.etag ?? null };
  }

  async patchEvent(
    ownerId: string,
    calendarId: string,
    eventId: string,
    event: GoogleEventWrite,
  ): Promise<GoogleWrittenEvent> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    const res = await calendar.events.patch({ calendarId, eventId, requestBody: event });
    return { id: res.data.id ?? eventId, etag: res.data.etag ?? null };
  }

  async deleteEvent(ownerId: string, calendarId: string, eventId: string): Promise<void> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    await calendar.events.delete({ calendarId, eventId });
  }
}

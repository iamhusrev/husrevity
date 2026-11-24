import { Injectable } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleEventDto } from './google-calendar-event.mapper';

/** Injection token for the Google events reader (swapped for the fake in tests). */
export const GOOGLE_EVENTS_READER = 'GOOGLE_CALENDAR_EVENTS_READER';

export interface GoogleEventsListRequest {
  calendarId: string;
  pageToken?: string;
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  singleEvents?: boolean;
  showDeleted?: boolean;
}

export interface GoogleEventsPage {
  items: GoogleEventDto[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/**
 * The only Google surface the read engine needs. `FakeGoogleGateway.eventsList`
 * is adapted to it in tests: `{ listEvents: (_owner, req) => fake.eventsList(req) }`.
 */
export interface GoogleEventsReader {
  listEvents(ownerId: string, request: GoogleEventsListRequest): Promise<GoogleEventsPage>;
}

/** Production reader: googleapis client built from the owner's stored tokens. */
@Injectable()
export class GoogleApiEventsReader implements GoogleEventsReader {
  constructor(private readonly gcal: GoogleCalendarService) {}

  async listEvents(ownerId: string, req: GoogleEventsListRequest): Promise<GoogleEventsPage> {
    const { calendar } = await this.gcal.getCalendarClient(ownerId);
    const res = await calendar.events.list({
      calendarId: req.calendarId,
      pageToken: req.pageToken,
      syncToken: req.syncToken,
      timeMin: req.timeMin,
      timeMax: req.timeMax,
      maxResults: req.maxResults,
      singleEvents: req.singleEvents,
      showDeleted: req.showDeleted,
    });
    return {
      items: (res.data.items ?? []) as GoogleEventDto[],
      nextPageToken: res.data.nextPageToken ?? undefined,
      nextSyncToken: res.data.nextSyncToken ?? undefined,
    };
  }
}

export { googleErrorStatus } from './google-error';

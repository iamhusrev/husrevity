import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CODE_CHALLENGE_PATTERN } from './google-calendar-connect-dtos';

/** Upper bound of calendars one selection may name (a calendarList is far smaller in practice). */
export const MAX_SELECTED_CALENDARS = 250;

/** `PUT /integrations/google-calendar/calendars/selection` */
export class SelectCalendarsRequestDto {
  @IsArray()
  @ArrayMaxSize(MAX_SELECTED_CALENDARS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(255, { each: true })
  selected!: string[];
}

/** `PUT /integrations/google-calendar/write` */
export class SetWriteRequestDto {
  @IsBoolean()
  enabled!: boolean;

  /** Required only when turning write on needs the extra-permission consent. */
  @IsOptional()
  @IsString()
  @Matches(CODE_CHALLENGE_PATTERN, { message: 'codeChallenge must be a base64url SHA-256 hash' })
  codeChallenge?: string;
}

/** `GET /integrations/google-calendar/events?from&to` (ISO 8601 instants, [from, to), at most 100 days). */
export class GoogleEventsQueryDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

/** One selectable calendar. `managed` marks the calendar Husrevity publishes into: never selectable. */
export interface GoogleCalendarChoiceDto {
  id: string;
  summary: string;
  backgroundColor: string | null;
  accessRole: string;
  primary: boolean;
  selected: boolean;
  managed: boolean;
}

/**
 * One Google event of the web feed. Timed events carry `startAt`/`endAt` (ISO
 * instants); all-day events carry `startDate`/`endDateExclusive` ('YYYY-MM-DD',
 * no timezone). Only title and timing are stored: no description, attendees or location.
 */
export interface GoogleFeedEventDto {
  id: string;
  subscriptionId: string;
  googleEventId: string;
  recurringEventId: string | null;
  title: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDateExclusive: string | null;
  status: string;
  htmlLink: string | null;
}

export interface GoogleFeedDto {
  events: GoogleFeedEventDto[];
  /** Ids of legacy `source='gcal'` items the web must hide because the same events are served above. */
  hiddenLegacyItemIds: string[];
}

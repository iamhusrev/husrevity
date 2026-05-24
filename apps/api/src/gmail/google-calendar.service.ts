import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { GmailAccount } from './gmail-account.entity';
import { GmailTokenService } from './gmail-token.service';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { ApiException } from '../common/api.exception';
import { GoogleCalendarEventDto } from './dto/gmail-dtos';

/**
 * Read-only Google Calendar access for an already-connected Gmail account.
 * Reuses the account's OAuth tokens (GmailTokenService.freshAccessToken) — no
 * separate consent. Requires the calendar.readonly scope on the grant.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    @InjectRepository(GmailAccount)
    private readonly accounts: Repository<GmailAccount>,
    private readonly tokens: GmailTokenService,
    private readonly ms: MicrosoftGraphService,
  ) {}

  async listEvents(
    ownerId: string,
    accountId: string,
    from?: string,
    to?: string,
  ): Promise<GoogleCalendarEventDto[]> {
    const account = await this.requireAccount(ownerId, accountId);
    if (account.provider === 'microsoft') return this.ms.listCalendar(account, from, to);
    const accessToken = await this.tokens.freshAccessToken(account);
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    try {
      const r = await calendar.events.list({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        timeMin: from ?? new Date(Date.now() - 30 * 864e5).toISOString(),
        timeMax: to ?? new Date(Date.now() + 90 * 864e5).toISOString(),
      });
      return (r.data.items ?? []).map((e) => ({
        id: e.id ?? '',
        accountId: account.id,
        accountEmail: account.email,
        title: e.summary ?? '(no title)',
        description: e.description ?? null,
        location: e.location ?? null,
        startAt: e.start?.dateTime ?? e.start?.date ?? null,
        endAt: e.end?.dateTime ?? e.end?.date ?? null,
        allDay: !e.start?.dateTime,
        htmlLink: e.htmlLink ?? null,
      }));
    } catch (e) {
      this.logger.error('Google Calendar list failed', e as Error);
      throw ApiException.badRequest(
        `Calendar fetch failed (reconnect the account to grant Calendar access?): ${
          (e as Error).message
        }`,
      );
    }
  }

  private async requireAccount(ownerId: string, accountId: string): Promise<GmailAccount> {
    if (!/^\d+$/.test(accountId)) throw ApiException.badRequest('Invalid account id');
    const a = await this.accounts.findOne({ where: { id: accountId, ownerId } });
    if (!a) throw ApiException.notFound('Gmail account not found');
    return a;
  }
}

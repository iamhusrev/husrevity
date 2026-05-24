import { Injectable, Logger } from '@nestjs/common';
import { GmailAccount } from './gmail-account.entity';
import { GmailTokenService } from './gmail-token.service';
import { ApiException } from '../common/api.exception';
import {
  GoogleCalendarEventDto,
  GoogleContactDto,
  MessageDetailDto,
  MessageSummaryDto,
  PageDto,
  SendRequestDto,
  SendResponseDto,
} from './dto/gmail-dtos';

const GRAPH = 'https://graph.microsoft.com/v1.0';

interface GraphAddr {
  emailAddress?: { name?: string; address?: string };
}
interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  from?: GraphAddr;
  toRecipients?: GraphAddr[];
  body?: { contentType?: string; content?: string };
  flag?: { flagStatus?: string };
}

/**
 * Outlook (Microsoft Graph) mail/calendar/contacts via plain fetch — same
 * shape contract as the Google services so the controllers/DTOs/web are
 * unchanged. Tokens come from the provider-aware GmailTokenService.
 */
@Injectable()
export class MicrosoftGraphService {
  private readonly logger = new Logger(MicrosoftGraphService.name);

  constructor(private readonly tokens: GmailTokenService) {}

  private addrs(list?: GraphAddr[]): string | null {
    const v = (list ?? [])
      .map((r) => r.emailAddress?.address)
      .filter(Boolean)
      .join(', ');
    return v || null;
  }

  private async graph<T>(
    account: GmailAccount,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const token = await this.tokens.freshAccessToken(account);
    try {
      const r = await fetch(`${GRAPH}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(extraHeaders ?? {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 202 || r.status === 204) return {} as T;
      const json = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return json as T;
    } catch (e) {
      this.logger.error('Microsoft Graph request failed', e as Error);
      throw ApiException.badRequest(
        `Outlook request failed (reconnect the account?): ${(e as Error).message}`,
      );
    }
  }

  private toSummary(m: GraphMessage): MessageSummaryDto {
    return {
      id: m.id,
      gmailMessageId: m.id,
      threadId: m.conversationId ?? null,
      snippet: m.bodyPreview ?? null,
      fromAddr: m.from?.emailAddress?.address ?? null,
      toAddr: this.addrs(m.toRecipients),
      subject: m.subject ?? null,
      receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : null,
      unread: m.isRead === false,
      hasAttachment: !!m.hasAttachments,
      labels: m.flag?.flagStatus === 'flagged' ? 'STARRED' : null,
    };
  }

  async listMessages(
    account: GmailAccount,
    page: number,
    size: number,
  ): Promise<PageDto<MessageSummaryDto>> {
    const qs =
      `/me/messages?$top=${size}&$skip=${page * size}&$count=true` +
      `&$orderby=receivedDateTime desc` +
      `&$select=id,conversationId,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,from,toRecipients,flag`;
    const data = await this.graph<{ value: GraphMessage[]; '@odata.count'?: number }>(
      account,
      'GET',
      qs,
      undefined,
      { ConsistencyLevel: 'eventual' },
    );
    const content = (data.value ?? []).map((m) => this.toSummary(m));
    const total = data['@odata.count'] ?? page * size + content.length;
    return { content, page, size, total, totalPages: Math.ceil(total / size) || 1 };
  }

  async getMessageDetail(
    account: GmailAccount,
    messageId: string,
  ): Promise<MessageDetailDto> {
    const m = await this.graph<GraphMessage>(
      account,
      'GET',
      `/me/messages/${messageId}?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,body,flag`,
    );
    const isHtml = (m.body?.contentType ?? '').toLowerCase() === 'html';
    return {
      gmailMessageId: m.id,
      threadId: m.conversationId ?? null,
      subject: m.subject ?? null,
      fromAddr: m.from?.emailAddress?.address ?? null,
      toAddr: this.addrs(m.toRecipients),
      receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : null,
      bodyText: isHtml ? null : (m.body?.content ?? null),
      bodyHtml: isHtml ? (m.body?.content ?? null) : null,
      labels: m.flag?.flagStatus === 'flagged' ? ['STARRED'] : [],
    };
  }

  async send(account: GmailAccount, req: SendRequestDto): Promise<SendResponseDto> {
    const toRecipients = req.to
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((address) => ({ emailAddress: { address } }));
    const ccRecipients = (req.cc ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((address) => ({ emailAddress: { address } }));
    const bccRecipients = (req.bcc ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((address) => ({ emailAddress: { address } }));
    await this.graph(account, 'POST', '/me/sendMail', {
      message: {
        subject: req.subject,
        body: { contentType: req.html ? 'HTML' : 'Text', content: req.body },
        toRecipients,
        ccRecipients,
        bccRecipients,
      },
      saveToSentItems: true,
    });
    return { gmailMessageId: null, threadId: null };
  }

  async sync(account: GmailAccount): Promise<number> {
    // Pragmatic: Outlook messages are served pass-through (no local cache),
    // so "sync" just confirms connectivity and returns the first page count.
    const page = await this.listMessages(account, 0, 50);
    return page.content.length;
  }

  async setUnread(
    account: GmailAccount,
    messageId: string,
    unread: boolean,
  ): Promise<void> {
    await this.graph(account, 'PATCH', `/me/messages/${messageId}`, {
      isRead: !unread,
    });
  }

  async setStarred(
    account: GmailAccount,
    messageId: string,
    starred: boolean,
  ): Promise<void> {
    await this.graph(account, 'PATCH', `/me/messages/${messageId}`, {
      flag: { flagStatus: starred ? 'flagged' : 'notFlagged' },
    });
  }

  // ─── Calendar / Contacts (used in Faz D) ──────────────────────────────────

  async listCalendar(
    account: GmailAccount,
    from?: string,
    to?: string,
  ): Promise<GoogleCalendarEventDto[]> {
    const start = from ?? new Date(Date.now() - 30 * 864e5).toISOString();
    const end = to ?? new Date(Date.now() + 90 * 864e5).toISOString();
    const data = await this.graph<{
      value: Array<{
        id: string;
        subject?: string;
        bodyPreview?: string;
        location?: { displayName?: string };
        start?: { dateTime?: string };
        end?: { dateTime?: string };
        isAllDay?: boolean;
        webLink?: string;
      }>;
    }>(
      account,
      'GET',
      `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(
        end,
      )}&$top=250&$orderby=start/dateTime&$select=id,subject,bodyPreview,location,start,end,isAllDay,webLink`,
      undefined,
      { Prefer: 'outlook.timezone="UTC"' },
    );
    return (data.value ?? []).map((e) => ({
      id: e.id,
      accountId: account.id,
      accountEmail: account.email,
      title: e.subject ?? '(no title)',
      description: e.bodyPreview ?? null,
      location: e.location?.displayName ?? null,
      startAt: e.start?.dateTime ? new Date(e.start.dateTime + 'Z').toISOString() : null,
      endAt: e.end?.dateTime ? new Date(e.end.dateTime + 'Z').toISOString() : null,
      allDay: !!e.isAllDay,
      htmlLink: e.webLink ?? null,
    }));
  }

  async listContacts(account: GmailAccount): Promise<GoogleContactDto[]> {
    const data = await this.graph<{
      value: Array<{
        id: string;
        displayName?: string;
        emailAddresses?: { address?: string }[];
        mobilePhone?: string;
        businessPhones?: string[];
      }>;
    }>(
      account,
      'GET',
      `/me/contacts?$top=200&$select=id,displayName,emailAddresses,mobilePhone,businessPhones`,
    );
    return (data.value ?? [])
      .map((c) => ({
        id: c.id,
        accountId: account.id,
        accountEmail: account.email,
        name: c.displayName ?? null,
        email: c.emailAddresses?.[0]?.address ?? null,
        phone: c.mobilePhone ?? c.businessPhones?.[0] ?? null,
        photoUrl: null,
      }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }
}

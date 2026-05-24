import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, gmail_v1 } from 'googleapis';
import { GmailAccount } from './gmail-account.entity';
import { GmailMessage } from './gmail-message.entity';
import { GmailTokenService } from './gmail-token.service';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { ApiException } from '../common/api.exception';
import {
  AccountResponseDto,
  MessageDetailDto,
  MessageSummaryDto,
  PageDto,
  SendRequestDto,
  SendResponseDto,
} from './dto/gmail-dtos';

const SYNC_PAGE_SIZE = 100;
const MAX_FULL_SYNC = 300;

/**
 * Port of GmailService.java. Uses `googleapis` (the official Node Google API
 * client) — equivalent of Spring's google-api-services-gmail.
 */
@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    @InjectRepository(GmailAccount)
    private readonly accounts: Repository<GmailAccount>,
    @InjectRepository(GmailMessage)
    private readonly messages: Repository<GmailMessage>,
    private readonly tokens: GmailTokenService,
    private readonly ms: MicrosoftGraphService,
  ) {}

  async listAccounts(ownerId: string): Promise<AccountResponseDto[]> {
    const rows = await this.accounts.find({ where: { ownerId } });
    const out: AccountResponseDto[] = [];
    for (const a of rows) {
      const unread = await this.messages.count({
        where: { gmailAccountId: a.id, unread: true },
      });
      out.push(AccountResponseDto.from(a, unread));
    }
    return out;
  }

  async deleteAccount(ownerId: string, accountId: string): Promise<void> {
    const a = await this.requireAccount(ownerId, accountId);
    await this.accounts.softRemove(a);
  }

  async listMessages(
    ownerId: string,
    accountId: string,
    page: number,
    size: number,
  ): Promise<PageDto<MessageSummaryDto>> {
    const a = await this.requireAccount(ownerId, accountId);
    if (a.provider === 'microsoft') return this.ms.listMessages(a, page, size);
    const [rows, total] = await this.messages.findAndCount({
      where: { gmailAccountId: a.id },
      order: { receivedAt: 'DESC' },
      skip: page * size,
      take: size,
    });
    return {
      content: rows.map(MessageSummaryDto.from),
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    };
  }

  async getMessageDetail(
    ownerId: string,
    accountId: string,
    gmailMessageId: string,
  ): Promise<MessageDetailDto> {
    const a = await this.requireAccount(ownerId, accountId);
    if (a.provider === 'microsoft') return this.ms.getMessageDetail(a, gmailMessageId);
    const gmail = await this.client(a);
    try {
      const r = await gmail.users.messages.get({
        userId: 'me',
        id: gmailMessageId,
        format: 'full',
      });
      return this.toDetail(r.data);
    } catch (e) {
      this.logger.error('Gmail get failed', e as Error);
      throw ApiException.badRequest(`Failed to fetch message: ${(e as Error).message}`);
    }
  }

  async send(ownerId: string, accountId: string, req: SendRequestDto): Promise<SendResponseDto> {
    const a = await this.requireAccount(ownerId, accountId);
    if (a.provider === 'microsoft') return this.ms.send(a, req);
    const gmail = await this.client(a);
    try {
      const raw = this.buildRawMime(a.email, req);
      const encoded = Buffer.from(raw, 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      const sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });
      return {
        gmailMessageId: sent.data.id ?? null,
        threadId: sent.data.threadId ?? null,
      };
    } catch (e) {
      this.logger.error('Gmail send failed', e as Error);
      throw ApiException.badRequest(`Send failed: ${(e as Error).message}`);
    }
  }

  /**
   * Incremental sync via Gmail's real historyId. If we have a stored historyId
   * we pull only the delta (users.history.list); otherwise (or if the stored
   * id is too old → 404) we do a bounded full re-list. The account's historyId
   * is then set to the mailbox's current value from users.getProfile.
   */
  async sync(ownerId: string, accountId: string): Promise<number> {
    const a = await this.requireAccount(ownerId, accountId);
    if (a.provider === 'microsoft') return this.ms.sync(a);
    const gmail = await this.client(a);
    let upserts = 0;
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const currentHistoryId = profile.data.historyId ?? null;

      const ids = new Set<string>();
      let incremental = false;

      if (a.historyId) {
        try {
          let pageToken: string | undefined;
          do {
            const h = await gmail.users.history.list({
              userId: 'me',
              startHistoryId: a.historyId,
              historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
              pageToken,
            });
            for (const item of h.data.history ?? []) {
              for (const m of item.messages ?? []) if (m.id) ids.add(m.id);
              for (const ma of item.messagesAdded ?? [])
                if (ma.message?.id) ids.add(ma.message.id);
              for (const la of item.labelsAdded ?? [])
                if (la.message?.id) ids.add(la.message.id);
              for (const lr of item.labelsRemoved ?? [])
                if (lr.message?.id) ids.add(lr.message.id);
            }
            pageToken = h.data.nextPageToken ?? undefined;
          } while (pageToken);
          incremental = true;
        } catch (e) {
          this.logger.warn(
            `Gmail history.list failed (likely stale historyId) — full resync: ${
              (e as Error).message
            }`,
          );
        }
      }

      if (!incremental) {
        ids.clear();
        let pageToken: string | undefined;
        while (ids.size < MAX_FULL_SYNC) {
          const list = await gmail.users.messages.list({
            userId: 'me',
            maxResults: SYNC_PAGE_SIZE,
            pageToken,
          });
          for (const ref of list.data.messages ?? []) if (ref.id) ids.add(ref.id);
          pageToken = list.data.nextPageToken ?? undefined;
          if (!pageToken) break;
        }
      }

      for (const id of ids) {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'full',
        });
        await this.upsertCache(a.id, full.data);
        upserts++;
      }

      a.lastSyncAt = new Date();
      if (currentHistoryId) a.historyId = currentHistoryId;
      await this.accounts.save(a);
    } catch (e) {
      this.logger.error('Gmail sync failed', e as Error);
      throw ApiException.badRequest(`Sync failed: ${(e as Error).message}`);
    }
    return upserts;
  }

  async setUnread(
    ownerId: string,
    accountId: string,
    gmailMessageId: string,
    unread: boolean,
  ): Promise<void> {
    const a = await this.requireAccount(ownerId, accountId);
    if (a.provider === 'microsoft') return this.ms.setUnread(a, gmailMessageId, unread);
    const gmail = await this.client(a);
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: gmailMessageId,
        requestBody: unread
          ? { addLabelIds: ['UNREAD'] }
          : { removeLabelIds: ['UNREAD'] },
      });
    } catch (e) {
      this.logger.error('Gmail modify (unread) failed', e as Error);
      throw ApiException.badRequest(`Update failed: ${(e as Error).message}`);
    }
    await this.applyLabelToCache(a.id, gmailMessageId, 'UNREAD', unread);
  }

  async setStarred(
    ownerId: string,
    accountId: string,
    gmailMessageId: string,
    starred: boolean,
  ): Promise<void> {
    const a = await this.requireAccount(ownerId, accountId);
    if (a.provider === 'microsoft') return this.ms.setStarred(a, gmailMessageId, starred);
    const gmail = await this.client(a);
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: gmailMessageId,
        requestBody: starred
          ? { addLabelIds: ['STARRED'] }
          : { removeLabelIds: ['STARRED'] },
      });
    } catch (e) {
      this.logger.error('Gmail modify (star) failed', e as Error);
      throw ApiException.badRequest(`Update failed: ${(e as Error).message}`);
    }
    await this.applyLabelToCache(a.id, gmailMessageId, 'STARRED', starred);
  }

  private async applyLabelToCache(
    accountId: string,
    gmailMessageId: string,
    label: string,
    present: boolean,
  ): Promise<void> {
    const row = await this.messages.findOne({
      where: { gmailAccountId: accountId, gmailMessageId },
    });
    if (!row) return;
    const set = new Set((row.labels ?? '').split(',').filter(Boolean));
    if (present) set.add(label);
    else set.delete(label);
    row.labels = set.size ? Array.from(set).join(',') : null;
    if (label === 'UNREAD') row.unread = present;
    await this.messages.save(row);
  }

  private async upsertCache(accountId: string, m: gmail_v1.Schema$Message): Promise<void> {
    if (!m.id) return;
    const existing = await this.messages.findOne({
      where: { gmailAccountId: accountId, gmailMessageId: m.id },
    });
    const row =
      existing ?? this.messages.create({ gmailAccountId: accountId, gmailMessageId: m.id });

    row.threadId = m.threadId ?? null;
    row.snippet = m.snippet ?? null;

    const headers = m.payload?.headers ?? [];
    for (const h of headers) {
      switch (h.name) {
        case 'From':
          row.fromAddr = this.trim(h.value, 255);
          break;
        case 'To':
          row.toAddr = this.trim(h.value, 512);
          break;
        case 'Subject':
          row.subject = this.trim(h.value, 512);
          break;
      }
    }
    if (m.internalDate) {
      row.receivedAt = new Date(Number(m.internalDate));
    }
    const labels = m.labelIds ?? [];
    row.labels = labels.length ? labels.join(',') : null;
    row.unread = labels.includes('UNREAD');
    row.hasAttachment = this.payloadHasAttachment(m.payload);

    await this.messages.save(row);
  }

  private payloadHasAttachment(
    part?: gmail_v1.Schema$MessagePart | null,
  ): boolean {
    if (!part) return false;
    if (part.filename && part.filename.length > 0) return true;
    if (part.body?.attachmentId) return true;
    for (const p of part.parts ?? []) {
      if (this.payloadHasAttachment(p)) return true;
    }
    return false;
  }

  private toDetail(m: gmail_v1.Schema$Message): MessageDetailDto {
    const detail: MessageDetailDto = {
      gmailMessageId: m.id ?? '',
      threadId: m.threadId ?? null,
      subject: null,
      fromAddr: null,
      toAddr: null,
      receivedAt: m.internalDate ? new Date(Number(m.internalDate)) : null,
      bodyText: null,
      bodyHtml: null,
      labels: m.labelIds ?? [],
    };
    const headers = m.payload?.headers ?? [];
    for (const h of headers) {
      switch (h.name) {
        case 'From':
          detail.fromAddr = h.value ?? null;
          break;
        case 'To':
          detail.toAddr = h.value ?? null;
          break;
        case 'Subject':
          detail.subject = h.value ?? null;
          break;
      }
    }
    const bodies: { text: string | null; html: string | null } = { text: null, html: null };
    if (m.payload) this.extractBodies(m.payload, bodies);
    detail.bodyText = bodies.text;
    detail.bodyHtml = bodies.html;
    return detail;
  }

  private extractBodies(
    part: gmail_v1.Schema$MessagePart,
    acc: { text: string | null; html: string | null },
  ): void {
    const mime = part.mimeType ?? '';
    const data = part.body?.data;
    if (data) {
      const text = Buffer.from(data, 'base64').toString('utf-8');
      if (mime.startsWith('text/plain') && acc.text === null) acc.text = text;
      if (mime.startsWith('text/html') && acc.html === null) acc.html = text;
    }
    for (const p of part.parts ?? []) this.extractBodies(p, acc);
  }

  private buildRawMime(fromEmail: string, req: SendRequestDto): string {
    const html = req.html === true;
    const lines = [
      `From: ${fromEmail}`,
      `To: ${req.to}`,
      ...(req.cc ? [`Cc: ${req.cc}`] : []),
      ...(req.bcc ? [`Bcc: ${req.bcc}`] : []),
      `Subject: ${req.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
      '',
      req.body,
    ];
    return lines.join('\r\n');
  }

  private async client(a: GmailAccount): Promise<gmail_v1.Gmail> {
    const accessToken = await this.tokens.freshAccessToken(a);
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: oauth2 });
  }

  private async requireAccount(ownerId: string, accountId: string): Promise<GmailAccount> {
    if (!/^\d+$/.test(accountId)) throw ApiException.badRequest('Invalid account id');
    const a = await this.accounts.findOne({ where: { id: accountId, ownerId } });
    if (!a) throw ApiException.notFound('Gmail account not found');
    return a;
  }

  private trim(v: string | null | undefined, max: number): string | null {
    if (!v) return null;
    return v.length <= max ? v : v.slice(0, max);
  }
}

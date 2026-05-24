import { IsEmail, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { GmailAccount } from '../gmail-account.entity';
import { GmailMessage } from '../gmail-message.entity';

export class AuthorizeUrlResponseDto {
  url!: string;
  state!: string;
}

export class MobileCallbackRequestDto {
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  codeVerifier?: string;

  @IsNotEmpty()
  redirectUri!: string;
}

export class AccountResponseDto {
  id!: string;
  provider!: 'google' | 'microsoft';
  email!: string;
  displayName!: string | null;
  scopes!: string | null;
  tokenExpiresAt!: Date | null;
  lastSyncAt!: Date | null;
  unreadCount!: number;

  static from(a: GmailAccount, unread: number): AccountResponseDto {
    return {
      id: a.id,
      provider: a.provider,
      email: a.email,
      displayName: a.displayName,
      scopes: a.scopes,
      tokenExpiresAt: a.tokenExpiresAt,
      lastSyncAt: a.lastSyncAt,
      unreadCount: unread,
    };
  }
}

export class MessageSummaryDto {
  id!: string;
  gmailMessageId!: string;
  threadId!: string | null;
  snippet!: string | null;
  fromAddr!: string | null;
  toAddr!: string | null;
  subject!: string | null;
  receivedAt!: Date | null;
  unread!: boolean;
  hasAttachment!: boolean;
  labels!: string | null;

  static from(m: GmailMessage): MessageSummaryDto {
    return {
      id: m.id,
      gmailMessageId: m.gmailMessageId,
      threadId: m.threadId,
      snippet: m.snippet,
      fromAddr: m.fromAddr,
      toAddr: m.toAddr,
      subject: m.subject,
      receivedAt: m.receivedAt,
      unread: m.unread,
      hasAttachment: m.hasAttachment,
      labels: m.labels,
    };
  }
}

export class MessageDetailDto {
  gmailMessageId!: string;
  threadId!: string | null;
  subject!: string | null;
  fromAddr!: string | null;
  toAddr!: string | null;
  receivedAt!: Date | null;
  bodyText!: string | null;
  bodyHtml!: string | null;
  labels!: string[];
}

export class SendRequestDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  cc?: string;

  @IsOptional()
  bcc?: string;

  @IsNotEmpty()
  subject!: string;

  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsBoolean()
  html?: boolean;
}

export class SendResponseDto {
  gmailMessageId!: string | null;
  threadId!: string | null;
}

export class PageDto<T> {
  content!: T[];
  page!: number;
  size!: number;
  total!: number;
  totalPages!: number;
}

export class GoogleCalendarEventDto {
  id!: string;
  accountId!: string;
  accountEmail!: string;
  title!: string;
  description!: string | null;
  location!: string | null;
  startAt!: string | null;
  endAt!: string | null;
  allDay!: boolean;
  htmlLink!: string | null;
}

export class GoogleContactDto {
  id!: string;
  accountId!: string;
  accountEmail!: string;
  name!: string | null;
  email!: string | null;
  phone!: string | null;
  photoUrl!: string | null;
}

export class GoogleDriveFileDto {
  id!: string;
  accountId!: string;
  accountEmail!: string;
  name!: string;
  mimeType!: string | null;
  modifiedTime!: string | null;
  size!: string | null;
  iconLink!: string | null;
  webViewLink!: string | null;
}

// Mirrors the NestJS gmail DTOs (apps/api/src/gmail/dto/gmail-dtos.ts).

export interface GmailAccountResponse {
  id: number;
  provider: "google" | "microsoft";
  email: string;
  displayName?: string | null;
  scopes?: string | null;
  tokenExpiresAt?: string | null;
  lastSyncAt?: string | null;
  unreadCount: number;
}

export interface GmailMessageSummary {
  id: string;
  gmailMessageId: string;
  threadId?: string | null;
  snippet?: string | null;
  fromAddr?: string | null;
  toAddr?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
  unread: boolean;
  hasAttachment: boolean;
  labels?: string | null;
}

export interface GmailMessagePage {
  content: GmailMessageSummary[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface GmailMessageDetail {
  gmailMessageId: string;
  threadId?: string | null;
  subject?: string | null;
  fromAddr?: string | null;
  toAddr?: string | null;
  receivedAt?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  labels: string[];
}

export interface GmailSendRequest {
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  body: string;
  html?: boolean;
}

export interface GmailSendResponse {
  gmailMessageId: string | null;
  threadId: string | null;
}

export interface GmailAuthorizeUrlResponse {
  url: string;
  state: string;
}

export interface GoogleCalendarEvent {
  id: string;
  accountId: number;
  accountEmail: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  htmlLink?: string | null;
}

export interface GoogleContact {
  id: string;
  accountId: number;
  accountEmail: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
}

export interface GoogleDriveFile {
  id: string;
  accountId: number;
  accountEmail: string;
  name: string;
  mimeType: string | null;
  modifiedTime: string | null;
  size: string | null;
  iconLink: string | null;
  webViewLink: string | null;
}

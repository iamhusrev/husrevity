export type NotificationKind =
  | "reminder"
  | "task"
  | "calendar_event"
  | "time_block";

export interface NotificationResponse {
  id: string;
  kind: NotificationKind;
  sourceId: string | null;
  title: string;
  body: string | null;
  deepLink: string | null;
  scheduledAt: string;
  dispatchedAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export interface VapidKeyResponse {
  key: string;
}

export interface UnreadCountResponse {
  unread: number;
}

export interface NotificationDiagnostics {
  vapidConfigured: boolean;
  mailConfigured: boolean;
  emailOptIn: boolean;
  subscriptionCount: number;
  pendingCount: number;
  dispatchedLast24h: number;
  serverTime: string;
}

export interface TestNotificationResult {
  pushAttempted: boolean;
  pushSucceeded: boolean;
  emailAttempted: boolean;
  emailSucceeded: boolean;
  reason?: string;
}

export interface ResyncResult {
  reminders: number;
  tasks: number;
  calendarEvents: number;
  timeBlocks: number;
  total: number;
}

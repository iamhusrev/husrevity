export type NotificationKind =
  | "reminder"
  | "task"
  | "list_item"
  | "calendar_event"
  | "time_block"
  | "debt"
  | "finance_installment";

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

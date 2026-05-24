// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AUTH_ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/me",
  ME_PASSWORD: "/me/password",
  ME_NOTIFICATION_PREFERENCES: "/me/notification-preferences",
};

// ─── Notes ────────────────────────────────────────────────────────────────────

export const NOTE_ENDPOINTS = {
  LIST: "/notes",
  BY_ID: (id: number) => `/notes/${id}`,
  CREATE: "/notes",
  UPDATE: (id: number) => `/notes/${id}`,
  DELETE: (id: number) => `/notes/${id}`,
  REORDER: "/notes/reorder",
  TAGS: "/note-tags",
  TAG_BY_ID: (id: number) => `/note-tags/${id}`,
};

// ─── Reminders ────────────────────────────────────────────────────────────────

export const REMINDER_ENDPOINTS = {
  LISTS: "/reminder-lists",
  LIST_BY_ID: (id: number) => `/reminder-lists/${id}`,
  LIST_REMINDERS: (id: number) => `/reminder-lists/${id}/reminders`,
  REORDER_LISTS: "/reminder-lists/reorder",
  REMINDERS: "/reminders",
  BY_ID: (id: number) => `/reminders/${id}`,
  TOGGLE: (id: number) => `/reminders/${id}/toggle`,
  REORDER: "/reminders/reorder",
};

// ─── Vault ────────────────────────────────────────────────────────────────────

export const VAULT_ENDPOINTS = {
  ENTITIES: "/vault/entities",
  ENTITY_BY_ID: (id: number) => `/vault/entities/${id}`,
  ENTITY_ITEMS: (id: number) => `/vault/entities/${id}/items`,
  ENTITY_IMPORT: (id: number) => `/vault/entities/${id}/import`,
  ENTITY_EXPORT: (id: number) => `/vault/entities/${id}/export`,
  ITEM_BY_ID: (id: number) => `/vault/items/${id}`,
};

// ─── Lists (todo) ─────────────────────────────────────────────────────────────

export const LIST_ENDPOINTS = {
  ALL: "/lists",
  BY_ID: (id: number) => `/lists/${id}`,
  REORDER: "/lists/reorder",
  ITEMS: (id: number) => `/lists/${id}/items`,
  ITEMS_REORDER: (id: number) => `/lists/${id}/items/reorder`,
  ITEM_BY_ID: (id: number) => `/list-items/${id}`,
  ITEM_TOGGLE: (id: number) => `/list-items/${id}/toggle`,
};

// ─── Projects & Tasks ─────────────────────────────────────────────────────────

export const PROJECT_ENDPOINTS = {
  ALL: "/projects",
  BY_CODE: (code: string) => `/projects/${code}`,
  TASKS: (code: string) => `/projects/${code}/tasks`,
  TASKS_REORDER: (code: string) => `/projects/${code}/tasks/reorder`,
  TASK_BY_ID: (id: number) => `/tasks/${id}`,
};

// ─── Plans ────────────────────────────────────────────────────────────────────

export const PLAN_ENDPOINTS = {
  ALL: "/plans",
  BY_ID: (id: number) => `/plans/${id}`,
  ITEMS: (id: number) => `/plans/${id}/items`,
  ITEM_BY_ID: (id: number) => `/plan-items/${id}`,
};

// ─── Calendar ─────────────────────────────────────────────────────────────────

export const CALENDAR_ENDPOINTS = {
  EVENTS: "/calendar/events",
  EVENT_BY_ID: (id: number) => `/calendar/events/${id}`,
};

// ─── Gmail ────────────────────────────────────────────────────────────────────

export const GMAIL_ENDPOINTS = {
  ACCOUNTS: "/gmail/accounts",
  ACCOUNT_BY_ID: (id: number) => `/gmail/accounts/${id}`,
  MESSAGES: (id: number) => `/gmail/accounts/${id}/messages`,
  MESSAGE_DETAIL: (id: number, mid: string) => `/gmail/accounts/${id}/messages/${mid}`,
  MESSAGE_READ: (id: number, mid: string) => `/gmail/accounts/${id}/messages/${mid}/read`,
  MESSAGE_UNREAD: (id: number, mid: string) => `/gmail/accounts/${id}/messages/${mid}/unread`,
  MESSAGE_STAR: (id: number, mid: string) => `/gmail/accounts/${id}/messages/${mid}/star`,
  MESSAGE_UNSTAR: (id: number, mid: string) => `/gmail/accounts/${id}/messages/${mid}/unstar`,
  SEND: (id: number) => `/gmail/accounts/${id}/send`,
  SYNC: (id: number) => `/gmail/accounts/${id}/sync`,
  CALENDAR: (id: number) => `/gmail/accounts/${id}/calendar`,
  CONTACTS: (id: number) => `/gmail/accounts/${id}/contacts`,
  DRIVE: (id: number) => `/gmail/accounts/${id}/drive`,
  AUTHORIZE_URL: "/gmail/oauth/authorize-url",
};

// ─── AI ───────────────────────────────────────────────────────────────────────

export const AI_ENDPOINTS = {
  CONVERSATIONS: "/ai/conversations",
  CONVERSATION_BY_ID: (id: number) => `/ai/conversations/${id}`,
  MESSAGES: (id: number) => `/ai/conversations/${id}/messages`,
  SUGGESTIONS: "/ai/suggestions",
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const NOTIFICATION_ENDPOINTS = {
  LIST: "/notifications",
  UNREAD_COUNT: "/notifications/unread-count",
  MARK_READ: (id: string | number) => `/notifications/${id}/read`,
  MARK_ALL_READ: "/notifications/read-all",
  VAPID_PUBLIC_KEY: "/notifications/vapid-public-key",
  PUSH_SUBSCRIPTIONS: "/notifications/push-subscriptions",
};

// ─── Evkat (time blocks) ──────────────────────────────────────────────────────

export const TIME_BLOCK_ENDPOINTS = {
  LIST: "/time-blocks",
  BY_ID: (id: number | string) => `/time-blocks/${id}`,
  COMPLETE: (id: number | string) => `/time-blocks/${id}/complete`,
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const ADMIN_ENDPOINTS = {
  USERS: "/admin/users",
  USER_BY_ID: (id: string) => `/admin/users/${id}`,
  RESET_PASSWORD: (id: string) => `/admin/users/${id}/reset-password`,
  INVITES: "/admin/invites",
  INVITE_BY_ID: (id: string) => `/admin/invites/${id}`,
};

export const INVITE_PUBLIC_ENDPOINTS = {
  LOOKUP: (token: string) => `/auth/invite/${token}`,
  ACCEPT: (token: string) => `/auth/invite/${token}/accept`,
};

// ─── Finance ──────────────────────────────────────────────────────────────────

export const FINANCE_ENDPOINTS = {
  ACCOUNTS: "/finance/accounts",
  ACCOUNT_BY_ID: (id: string) => `/finance/accounts/${id}`,
  CATEGORIES: "/finance/categories",
  CATEGORY_BY_ID: (id: string) => `/finance/categories/${id}`,
  TRANSACTIONS: "/finance/transactions",
  TRANSACTION_BY_ID: (id: string) => `/finance/transactions/${id}`,
  TRANSFERS: "/finance/transfers",
  DEBTS: "/finance/debts",
  DEBT_BY_ID: (id: string) => `/finance/debts/${id}`,
  DEBT_SETTLE: (id: string) => `/finance/debts/${id}/settle`,
  SUMMARY: "/finance/summary",
};

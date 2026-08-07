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
  LIST_RESTORE: (id: number) => `/reminder-lists/${id}/restore`,
  REORDER_LISTS: "/reminder-lists/reorder",
  REMINDERS: "/reminders",
  BY_ID: (id: number) => `/reminders/${id}`,
  RESTORE: (id: number) => `/reminders/${id}/restore`,
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
  IMPORT_CSV: (entityId: string | number) => `/vault/import-csv?entityId=${entityId}`,
};

// ─── Lists (todo) ─────────────────────────────────────────────────────────────

export const LIST_ENDPOINTS = {
  ALL: "/lists",
  BY_ID: (id: number) => `/lists/${id}`,
  RESTORE: (id: number) => `/lists/${id}/restore`,
  REORDER: "/lists/reorder",
  ITEMS: (id: number) => `/lists/${id}/items`,
  ITEMS_REORDER: (id: number) => `/lists/${id}/items/reorder`,
  ITEM_BY_ID: (id: number) => `/list-items/${id}`,
  ITEM_RESTORE: (id: number) => `/list-items/${id}/restore`,
  ITEM_TOGGLE: (id: number) => `/list-items/${id}/toggle`,
  SECTIONS: (id: number) => `/lists/${id}/sections`,
  SECTIONS_REORDER: (id: number) => `/lists/${id}/sections/reorder`,
  SECTION_BY_ID: (id: number) => `/list-sections/${id}`,
};

// ─── Projects & Tasks ─────────────────────────────────────────────────────────

export type ProjectFilter = "all" | "mine" | "shared";

export const PROJECT_ENDPOINTS = {
  ALL: "/projects",
  LIST: (filter?: ProjectFilter) =>
    filter && filter !== "all" ? `/projects?filter=${filter}` : "/projects",
  BY_ID: (id: number) => `/projects/${id}`,
  RESTORE: (id: number) => `/projects/${id}/restore`,
  TASKS: (id: number) => `/projects/${id}/tasks`,
  TASKS_REORDER: (id: number) => `/projects/${id}/tasks/reorder`,
  TASK_BY_ID: (id: number) => `/tasks/${id}`,
  TASK_RESTORE: (id: number) => `/tasks/${id}/restore`,
  MEMBERS: (id: number) => `/projects/${id}/members`,
  MEMBER_BY_ID: (id: number, memberId: number) => `/projects/${id}/members/${memberId}`,
  LEAVE: (id: number) => `/projects/${id}/members/me`,
  INVITES: (id: number) => `/projects/${id}/invites`,
  INVITE_BY_ID: (id: number, inviteId: number) => `/projects/${id}/invites/${inviteId}`,
};

export const PROJECT_INVITE_PUBLIC_ENDPOINTS = {
  LOOKUP: (token: string) => `/project-invites/${token}`,
  ACCEPT: (token: string) => `/project-invites/${token}/accept`,
  REGISTER: (token: string) => `/project-invites/${token}/register`,
};

// ─── Plans ────────────────────────────────────────────────────────────────────

export const PLAN_ENDPOINTS = {
  ALL: "/plans",
  BY_ID: (id: number) => `/plans/${id}`,
  RESTORE: (id: number) => `/plans/${id}/restore`,
  ITEMS: (id: number) => `/plans/${id}/items`,
  ITEM_BY_ID: (id: number) => `/plan-items/${id}`,
  ITEM_RESTORE: (id: number) => `/plan-items/${id}/restore`,
};

// ─── Calendar ─────────────────────────────────────────────────────────────────

export const CALENDAR_ENDPOINTS = {
  EVENTS: "/calendar/events",
  EVENT_BY_ID: (id: number) => `/calendar/events/${id}`,
  EVENT_RESTORE: (id: number) => `/calendar/events/${id}/restore`,
};

// ─── AI ───────────────────────────────────────────────────────────────────────

export const AI_ENDPOINTS = {
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

// ─── Evkat (time blocks — legacy per-date planner) ────────────────────────────

export const TIME_BLOCK_ENDPOINTS = {
  LIST: "/time-blocks",
  BY_ID: (id: number | string) => `/time-blocks/${id}`,
  COMPLETE: (id: number | string) => `/time-blocks/${id}/complete`,
};

// ─── Evkat (routine — fixed daily template) ───────────────────────────────────

export const ROUTINE_ENDPOINTS = {
  SEGMENTS: "/routine/segments",
  SEGMENT_BY_ID: (id: string) => `/routine/segments/${id}`,
  SEGMENTS_REORDER: "/routine/segments/reorder",
  SEGMENT_ACTIVITIES: (id: string) => `/routine/segments/${id}/activities`,
  SEGMENT_ACTIVITIES_REORDER: (id: string) =>
    `/routine/segments/${id}/activities/reorder`,
  ACTIVITY_BY_ID: (id: string) => `/routine/activities/${id}`,
};

// ─── Okumalar (reading / habit tracker) ───────────────────────────────────────

export const READING_ENDPOINTS = {
  TRACKS: "/reading-tracks",
  TRACK_BY_ID: (id: string) => `/reading-tracks/${id}`,
  TRACKS_REORDER: "/reading-tracks/reorder",
  LOGS: (from: string, to: string) =>
    `/reading-tracks/logs?from=${from}&to=${to}`,
  LOG_FOR_DATE: (id: string, date: string) =>
    `/reading-tracks/${id}/logs/${date}`,
};

// ─── Users (directory) ──────────────────────────────────────────────────────

export const USER_DIRECTORY_ENDPOINTS = {
  LIST: "/users",
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

// ─── Sport ────────────────────────────────────────────────────────────────────

export const SPORT_ENDPOINTS = {
  PROFILE: "/sport/profile",
  PROGRAMS: "/sport/programs",
  PROGRAM_BY_ID: (id: string) => `/sport/programs/${id}`,
  PROGRAM_ACTIVATE: (id: string) => `/sport/programs/${id}/activate`,
  PROGRAM_GENERATE_AI: "/sport/programs/generate-ai",
  SESSIONS: "/sport/sessions",
  SESSION_BY_ID: (id: string) => `/sport/sessions/${id}`,
  SESSIONS_REORDER: "/sport/sessions/reorder",
  LOGS: "/sport/logs",
  LOG_BY_ID: (id: string) => `/sport/logs/${id}`,
  LOGS_FOR_PERIOD: (from: string, to: string) => `/sport/logs?from=${from}&to=${to}`,
  STATS: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return qs ? `/sport/stats?${qs}` : "/sport/stats";
  },
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
  DEBT_PAY: (id: string) => `/finance/debts/${id}/pay`,
  DEBT_PAYMENTS: (id: string) => `/finance/debts/${id}/payments`,
  ASSETS: "/finance/assets",
  ASSET_BY_ID: (id: string) => `/finance/assets/${id}`,
  LOANS: "/finance/loans",
  LOAN_BY_ID: (id: string) => `/finance/loans/${id}`,
  LOAN_INSTALLMENT_PAY: (loanId: string, installmentId: string) =>
    `/finance/loans/${loanId}/installments/${installmentId}/pay`,
  SUMMARY: "/finance/summary",
};

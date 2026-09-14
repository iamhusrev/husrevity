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
  DIAGNOSTICS: "/notifications/diagnostics",
  TEST: "/notifications/test",
  RESYNC: "/notifications/resync",
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

// ─── Learning tracker ───────────────────────────────────────────────────────

export const LEARNING_ENDPOINTS = {
  TOPICS: "/learning/topics",
  TOPIC_BY_ID: (id: string) => `/learning/topics/${id}`,
  TOPICS_REORDER: "/learning/topics/reorder",
  TOPIC_SUBTOPICS: (id: string) => `/learning/topics/${id}/subtopics`,
  TOPIC_SUBTOPICS_REORDER: (id: string) => `/learning/topics/${id}/subtopics/reorder`,
  SUBTOPIC_BY_ID: (id: string) => `/learning/subtopics/${id}`,
  TOPIC_ITEMS: (id: string) => `/learning/topics/${id}/items`,
  TOPIC_ITEMS_REORDER: (id: string) => `/learning/topics/${id}/items/reorder`,
  ITEM_BY_ID: (id: string) => `/learning/items/${id}`,
  ITEM_TOGGLE: (id: string) => `/learning/items/${id}/toggle`,
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

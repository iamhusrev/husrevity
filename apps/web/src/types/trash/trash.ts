/** Entity kinds the `/trash` endpoint lists; mirrors the API's `kind` query parameter. */
export type TrashKind =
  | "task"
  | "project"
  | "reminder"
  | "reminder_list"
  | "calendar_event"
  | "goal";

export const TRASH_KINDS: readonly TrashKind[] = [
  "task",
  "project",
  "reminder",
  "reminder_list",
  "calendar_event",
  "goal",
];

export interface TrashEntry {
  kind: TrashKind;
  id: string;
  title: string;
  /** ISO date-time. */
  deletedAt: string;
  /** Set for project tasks only; null for personal tasks and every other kind. */
  projectId: string | null;
  projectName: string | null;
  /** MCP tool name that restores the entry (informational on the web). */
  restoreTool: string;
  /** PATCH target relative to the API base, e.g. `/tasks/12/restore`. */
  restorePath: string;
}

export interface TrashListResponse {
  items: TrashEntry[];
  /** Opaque cursor for the next page; null on the last page. */
  nextCursor: string | null;
}

export interface TrashListParams {
  /** Empty or omitted means every kind. */
  kinds?: TrashKind[];
  /** ISO date-time; only entries deleted at or after it. */
  since?: string;
  /** 1-100, the API defaults to 20. */
  limit?: number;
  cursor?: string;
}

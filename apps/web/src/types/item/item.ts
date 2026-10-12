export type ItemKind = "task" | "event" | "log";
export type ItemStatus = "open" | "done" | "cancelled";
export type ItemSource = "web" | "ios" | "mcp" | "telegram" | "gmail" | "gcal" | "slack";

export interface ItemResponse {
  id: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  context: string | null;
  projectId: string | null;
  blockId: string | null;
  /** Goal this item counts toward (absent on payloads from before goals existed). */
  goalId?: string | null;
  scheduledAt: string | null;
  durationMin: number | null;
  dueAt: string | null;
  notifyMinutesBefore: number | null;
  rrule: string | null;
  status: ItemStatus;
  completedAt: string | null;
  payload: Record<string, unknown>;
  source: ItemSource;
  /** Present only on a virtual expanded occurrence of a recurring item. */
  occursOn?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemRequest {
  kind: ItemKind;
  title: string;
  notes?: string | null;
  context?: string | null;
  projectId?: string | null;
  blockId?: string | null;
  goalId?: string | null;
  scheduledAt?: string | null;
  durationMin?: number | null;
  dueAt?: string | null;
  notifyMinutesBefore?: number | null;
  rrule?: string | null;
  status?: ItemStatus;
  payload?: Record<string, unknown>;
  source?: ItemSource;
}

export interface ItemListFilter {
  from?: string;
  to?: string;
  kind?: ItemKind;
  context?: string;
  status?: ItemStatus;
  /** When true the API returns only unsorted open tasks (the inbox). */
  inbox?: boolean;
  /** Items that count toward this goal (direct, via linked projects and sub-goals). */
  goalId?: string;
}

export interface CompleteItemRequest {
  occursOn?: string;
}

export interface ParsedQuickAddDraft {
  title: string;
  scheduledAt?: string;
  context?: string;
  projectRef?: string;
  priority?: string;
  rrule?: string;
}

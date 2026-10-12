export type ChangeSetSource = "mcp" | "web" | "telegram" | "slack" | "system";
export type ChangeSetStatus = "applied" | "undone" | "partially_undone";
export type ChangeEntryTargetType = "item" | "item_occurrence";
export type ChangeEntryOp = "create" | "update" | "delete" | "complete";

export interface ChangeSetSummaryResponse {
  id: string;
  source: ChangeSetSource;
  label: string;
  status: ChangeSetStatus;
  createdAt: string;
  entryCount: number;
}

export interface ChangeEntryResponse {
  id: string;
  ordinal: number;
  targetType: ChangeEntryTargetType;
  targetId: string;
  op: ChangeEntryOp;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface ChangeSetDetailResponse {
  id: string;
  source: ChangeSetSource;
  label: string;
  status: ChangeSetStatus;
  undoneAt: string | null;
  createdAt: string;
  entries: ChangeEntryResponse[];
}

export interface UndoConflict {
  targetType: ChangeEntryTargetType;
  targetId: string;
  reason: string;
}

export interface UndoResponse {
  id: string;
  status: ChangeSetStatus;
  undoneEntries: number;
  conflicts: UndoConflict[];
}

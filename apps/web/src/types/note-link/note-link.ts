export type NoteLinkTargetType = "item" | "project" | "goal";

export interface NoteLinkResponse {
  id: string;
  noteId: string;
  targetType: NoteLinkTargetType;
  targetId: string;
  /** null when the target was deleted or is no longer accessible. */
  targetTitle: string | null;
  createdAt: string;
}

export interface CreateNoteLinkRequest {
  targetType: NoteLinkTargetType;
  targetId: string;
}

export interface LinkedNote {
  id: string;
  title: string;
  updatedAt: string;
}

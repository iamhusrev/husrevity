export type SuggestionMode = "task" | "hobby";
export type SuggestionKind = "task" | "hobby" | "mixed";
export type SuggestionSourceType =
  | "reminder"
  | "task"
  | "note"
  | "plan"
  | "project";

export interface SuggestionSourceRef {
  type: SuggestionSourceType;
  id: string;
}

export interface SuggestionItem {
  title: string;
  description: string;
  kind: SuggestionKind;
  sourceRef: SuggestionSourceRef | null;
  reasonShort: string;
}

export interface SuggestionsRequest {
  mode: SuggestionMode;
  count?: 1 | 3;
}

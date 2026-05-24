export const TIME_BLOCK_CATEGORIES = [
  "work",
  "focus",
  "rest",
  "exercise",
  "family",
  "other",
] as const;
export type TimeBlockCategory = (typeof TIME_BLOCK_CATEGORIES)[number];

export const TIME_BLOCK_COLOR_TOKENS = [
  "husrev-amber",
  "husrev-ember",
  "husrev-moss",
  "husrev-ink",
  "husrev-sand",
] as const;
export type TimeBlockColorToken = (typeof TIME_BLOCK_COLOR_TOKENS)[number];

export interface TimeBlockResponse {
  id: string;
  title: string;
  notes: string | null;
  startAt: string;
  endAt: string;
  category: TimeBlockCategory | null;
  colorToken: TimeBlockColorToken | null;
  notifyMinutesBefore: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeBlockRequest {
  title: string;
  notes?: string | null;
  startAt: string;
  endAt: string;
  category?: TimeBlockCategory | null;
  colorToken?: TimeBlockColorToken | null;
  notifyMinutesBefore?: number | null;
}

export const CATEGORY_COLOR_FALLBACK: Record<TimeBlockCategory, TimeBlockColorToken> = {
  work: "husrev-ember",
  focus: "husrev-amber",
  rest: "husrev-moss",
  exercise: "husrev-ember",
  family: "husrev-moss",
  other: "husrev-ink",
};

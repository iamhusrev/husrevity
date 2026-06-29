export const READING_COLOR_TOKENS = [
  "husrev-amber",
  "husrev-ember",
  "husrev-moss",
  "husrev-ink",
  "husrev-sand",
] as const;
export type ReadingColorToken = (typeof READING_COLOR_TOKENS)[number];

export interface ReadingTrackResponse {
  id: string;
  name: string;
  colorToken: ReadingColorToken | null;
  tracksListened: boolean;
  dailyTarget: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingTrackRequest {
  name: string;
  colorToken?: ReadingColorToken | null;
  tracksListened?: boolean;
  dailyTarget?: string | null;
}

export interface ReadingLogResponse {
  id: string;
  trackId: string;
  logDate: string;
  pageRange: string | null;
  read: boolean;
  listened: boolean;
}

export interface ReadingLogRequest {
  pageRange?: string | null;
  read?: boolean;
  listened?: boolean;
}

export interface ReadingReorderItem {
  id: string;
  position: number;
}

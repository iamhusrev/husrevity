export const ROUTINE_COLOR_TOKENS = [
  "husrev-amber",
  "husrev-ember",
  "husrev-moss",
  "husrev-ink",
  "husrev-sand",
] as const;
export type RoutineColorToken = (typeof ROUTINE_COLOR_TOKENS)[number];

export interface RoutineActivityResponse {
  id: string;
  segmentId: string;
  text: string;
  position: number;
}

export interface RoutineSegmentResponse {
  id: string;
  name: string;
  startMinute: number | null;
  endMinute: number | null;
  theme: string | null;
  colorToken: RoutineColorToken | null;
  notes: string | null;
  position: number;
  activities: RoutineActivityResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutineSegmentRequest {
  name: string;
  startMinute?: number | null;
  endMinute?: number | null;
  theme?: string | null;
  colorToken?: RoutineColorToken | null;
  notes?: string | null;
}

export interface RoutineActivityRequest {
  text: string;
  position?: number;
}

export interface RoutineReorderItem {
  id: string;
  position: number;
}

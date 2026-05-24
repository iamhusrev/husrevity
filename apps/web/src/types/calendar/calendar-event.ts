export interface EventResponse {
  id: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string | null;
  colorHex?: string | null;
  reminderMinutes?: number | null;
  recurrenceRule?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EventRequest {
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  location?: string | null;
  colorHex?: string | null;
  reminderMinutes?: number | null;
  recurrenceRule?: string | null;
}

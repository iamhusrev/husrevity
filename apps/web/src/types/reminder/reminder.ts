export type ReminderPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface ReminderListResponse {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
  position: number;
  itemCount: number;
}

export interface ReminderListRequest {
  name: string;
  color?: string;
  icon?: string | null;
}

export interface ReminderResponse {
  id: number;
  listId?: number | null;
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  notifyMinutesBefore?: number | null;
  completedAt?: string | null;
  priority: ReminderPriority;
  flag: boolean;
  position: number;
}

export interface ReminderRequest {
  listId?: number | null;
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  notifyMinutesBefore?: number | null;
  priority?: ReminderPriority;
  flag?: boolean;
}

export type { ReorderItem } from "@/types/common/reorder";

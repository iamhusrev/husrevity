export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ProjectResponse {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProjectRequest {
  code: string;
  name: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ProjectUpdateRequest {
  name?: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export interface TaskResponse {
  id: number;
  ownerId?: number | null;
  projectId?: number | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string | null;
  position: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TaskRequest {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  projectId?: number | null;
}

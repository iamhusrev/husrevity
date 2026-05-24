export interface PlanResponse {
  id: number;
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PlanRequest {
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status?: string | null;
}

export interface PlanItemResponse {
  id: number;
  planId: number;
  title: string;
  done: boolean;
  targetDate?: string | null;
  orderIndex: number;
  createdAt?: string | null;
}

export interface PlanItemRequest {
  title: string;
  done?: boolean;
  targetDate?: string | null;
  orderIndex?: number;
}

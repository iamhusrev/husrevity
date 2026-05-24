export interface TodoListResponse {
  id: number;
  name: string;
  color?: string | null;
  icon?: string | null;
  archived: boolean;
  position: number;
  createdAt?: string | null;
}

export interface TodoListRequest {
  name: string;
  color?: string | null;
  icon?: string | null;
  archived?: boolean;
}

export interface TodoListItemResponse {
  id: number;
  listId: number;
  text: string;
  done: boolean;
  dueAt?: string | null;
  position: number;
  createdAt?: string | null;
}

export interface TodoListItemRequest {
  text: string;
  done?: boolean;
  dueAt?: string | null;
  position?: number;
}

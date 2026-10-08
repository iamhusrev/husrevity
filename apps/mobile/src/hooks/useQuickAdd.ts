import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";

export interface ParsedDraft {
  title: string;
  scheduledAt?: string;
  context?: string;
  projectRef?: string;
  priority?: string;
  rrule?: string;
}

export interface CreateItemInput {
  kind?: "task" | "event" | "log";
  title: string;
  notes?: string | null;
  context?: string | null;
  projectId?: string | null;
  blockId?: string | null;
  scheduledAt?: string | null;
  durationMin?: number | null;
  dueAt?: string | null;
  notifyMinutesBefore?: number | null;
  rrule?: string | null;
  status?: "open" | "done" | "cancelled";
  payload?: Record<string, unknown>;
  source?: "web" | "ios" | "mcp" | "telegram" | "gmail" | "gcal" | "slack";
}

export interface ItemResponse {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  context: string | null;
  projectId: string | null;
  scheduledAt: string | null;
  dueAt: string | null;
  rrule: string | null;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export async function parseQuickAdd(text: string): Promise<ParsedDraft> {
  const res = await apiClient.post<ParsedDraft>("/items/parse-quick-add", { text });
  return res.data;
}

export async function createItem(input: CreateItemInput): Promise<ItemResponse> {
  const res = await apiClient.post<ItemResponse>("/items", {
    kind: input.kind || "task",
    source: "ios",
    ...input,
  });
  return res.data;
}

export function useQuickAddPreview() {
  return useMutation<ParsedDraft, Error, string>({
    mutationFn: parseQuickAdd,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation<ItemResponse, Error, CreateItemInput>({
    mutationFn: createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["today"] });
    },
  });
}

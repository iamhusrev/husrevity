import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiService } from "@/services/ai-service";
import type { SuggestionMode } from "@/types/ai/suggestion";

const AI_KEYS = {
  conversations: ["ai-conversations"] as const,
  messages: (id: number) => ["ai-messages", id] as const,
};

export function useAiConversations() {
  return useQuery({
    queryKey: AI_KEYS.conversations,
    queryFn: () => aiService.listConversations(),
    select: (d) => d.data,
  });
}

export function useCreateAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => aiService.createConversation(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: AI_KEYS.conversations }),
  });
}

export function useRenameAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      aiService.renameConversation(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: AI_KEYS.conversations }),
  });
}

export function useDeleteAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => aiService.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: AI_KEYS.conversations }),
  });
}

export function useAiMessages(conversationId: number) {
  return useQuery({
    queryKey: AI_KEYS.messages(conversationId),
    queryFn: () => aiService.listMessages(conversationId),
    select: (d) => d.data.content,
    enabled: Number.isFinite(conversationId) && conversationId > 0,
  });
}

export function useSendAiMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: number; content: string }) =>
      aiService.sendMessage(conversationId, content),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: AI_KEYS.messages(vars.conversationId) });
      qc.invalidateQueries({ queryKey: AI_KEYS.conversations });
    },
  });
}

/**
 * Mutation hook for the dashboard "Bugün ne yapsam?" widget. Manual trigger
 * (call .mutate()), so we never auto-spend a Gemini call on render.
 * The card itself fires once on mount and again on user actions (refresh,
 * mode change, count change).
 */
export function useAiSuggestions() {
  return useMutation({
    mutationFn: (input: { mode: SuggestionMode; count: 1 | 3 }) =>
      aiService.getSuggestions(input),
    // `data` is the full ApiResponse envelope; consumers access `.data` for the array.
  });
}

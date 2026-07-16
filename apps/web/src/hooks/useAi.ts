import { useMutation } from "@tanstack/react-query";
import { aiService } from "@/services/ai-service";
import type { SuggestionMode } from "@/types/ai/suggestion";

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

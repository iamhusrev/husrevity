import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { itemService } from "@/services/item-service";
import { CompleteItemRequest, ItemListFilter, ItemRequest } from "@/types/item/item";
import { alertStore } from "@/stores/alert-store";
import i18n from "@/configs/i18n";
import { ISTANBUL_TIMEZONE_OFFSET, slotToIso } from "@/utils/today-board";

const ITEM_KEYS = {
  all: ["items"] as const,
  list: (filter?: ItemListFilter) =>
    [
      "items",
      filter?.from ?? "",
      filter?.to ?? "",
      filter?.kind ?? "",
      filter?.context ?? "",
      filter?.status ?? "",
    ] as const,
  range: (fromYmd: string, toYmd: string, options?: ItemListFilter) =>
    [
      "items",
      "range",
      fromYmd,
      toYmd,
      options?.kind ?? "",
      options?.context ?? "",
      options?.status ?? "",
    ] as const,
  inbox: ["items", "inbox"] as const,
  goal: (goalId: string) => ["items", "goal", goalId] as const,
  detail: (id: string) => ["item", id] as const,
};

/** Goal progress is derived from items, so item writes must refresh ["goals"] too. */
const GOALS_KEY = ["goals"] as const;

export interface UseItemsInRangeOptions extends ItemListFilter {
  enabled?: boolean;
}

/**
 * Fetches items within a Europe/Istanbul calendar day range [fromYmd, toYmd].
 *
 * API choice verification (apps/api/src/item/item.service.ts):
 * - ItemService.matchesRange evaluates: `(!from || d >= from) && (!to || d <= to)` (inclusive bounds).
 * - ItemRecurrenceService.expand calls `rrule.between(fakeFrom, fakeTo, true)` (inclusive).
 * - loadOccurrenceOverrides filters `occursOn Between(from, to)`.
 * Therefore, `from` is the inclusive start instant (00:00:00+03:00) and `to` is the inclusive
 * end instant (23:59:59.999+03:00) of the respective Istanbul days.
 */
export function useItemsInRange(fromYmd: string, toYmd: string, options?: UseItemsInRangeOptions) {
  const fromIso = slotToIso(fromYmd, 0);
  const toIso = `${toYmd}T23:59:59.999${ISTANBUL_TIMEZONE_OFFSET}`;

  return useQuery({
    queryKey: ITEM_KEYS.range(fromYmd, toYmd, options),
    queryFn: () =>
      itemService.listItems({
        from: fromIso,
        to: toIso,
        kind: options?.kind,
        context: options?.context,
        status: options?.status,
      }),
    select: (d) => d.data,
    enabled: options?.enabled !== false && Boolean(fromYmd) && Boolean(toYmd),
    placeholderData: keepPreviousData,
  });
}

/**
 * Unsorted open tasks (no date, project, goal, block or rrule), newest first.
 * The key lives under ["items"], so every item mutation invalidates it.
 */
export function useInboxItems() {
  return useQuery({
    queryKey: ITEM_KEYS.inbox,
    queryFn: () => itemService.listItems({ inbox: true }),
    select: (d) => d.data,
  });
}

/**
 * Items that count toward a goal (direct, via linked projects and sub-goals; max 200,
 * recurring items come back as templates). Lives under ["items"] so item mutations refresh it.
 */
export function useGoalItems(goalId: string) {
  return useQuery({
    queryKey: ITEM_KEYS.goal(goalId),
    queryFn: () => itemService.listItems({ goalId }),
    select: (d) => d.data,
    enabled: !!goalId,
  });
}

export function useItems(filter?: ItemListFilter) {
  return useQuery({
    queryKey: ITEM_KEYS.list(filter),
    queryFn: () => itemService.listItems(filter),
    select: (d) => d.data,
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ITEM_KEYS.detail(id),
    queryFn: () => itemService.getItem(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ItemRequest) => itemService.createItem(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: GOALS_KEY });
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ItemRequest> }) =>
      itemService.updateItem(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: ITEM_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: GOALS_KEY });
    },
  });
}

function showMutationError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  alertStore.getState().show({
    title: i18n.t("common.error"),
    message: msg || i18n.t("common.error"),
    type: "error",
  });
}

export function useUpdateItemFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ItemRequest> }) =>
      itemService.updateItem(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: ITEM_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: GOALS_KEY });
    },
    // Shown here (not per call) so every caller gets exactly one alert.
    onError: showMutationError,
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => itemService.deleteItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: GOALS_KEY });
    },
  });
}

export function useCompleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      occursOn,
      body,
    }: {
      id: string;
      occursOn?: string;
      body?: CompleteItemRequest;
    }) => itemService.completeItem(id, body ?? (occursOn ? { occursOn } : {})),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: GOALS_KEY });
    },
  });
}

export function useScheduleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      scheduledAt,
      durationMin,
    }: {
      id: string;
      scheduledAt: string;
      durationMin?: number | null;
    }) => itemService.updateItem(id, { scheduledAt, durationMin }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ITEM_KEYS.all });
      qc.invalidateQueries({ queryKey: ITEM_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: ["today"] });
    },
    onError: showMutationError,
  });
}

/**
 * Preview-only — runs the shared parser server-side and returns a draft
 * for the user to confirm/edit, without creating anything. The quick-add
 * UI (later step) pairs this with useCreateItem() for the actual write.
 */
export function useQuickAddPreview() {
  return useMutation({
    mutationFn: (text: string) => itemService.parseQuickAdd(text),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { itemService } from "@/services/item-service";
import { CompleteItemRequest, ItemListFilter, ItemRequest } from "@/types/item/item";

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
  detail: (id: string) => ["item", id] as const,
};

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEM_KEYS.all }),
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
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => itemService.deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEM_KEYS.all }),
  });
}

export function useCompleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompleteItemRequest }) =>
      itemService.completeItem(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEM_KEYS.all }),
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

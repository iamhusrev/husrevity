import { useCallback } from "react";
import { useScheduleItem, useUpdateItemFields } from "@/hooks/useItems";
import { ItemResponse, ItemRequest } from "@/types/item/item";
import { moveToDay } from "@/utils/month-grid";
import { dateYmdIstanbul } from "@/utils/today-board";

export interface DragItemPayload {
  id: string;
  title: string;
  fromYmd: string;
  item: ItemResponse;
}

export interface UseMonthDropParams {
  isPending?: boolean;
  onSchedule?: (params: {
    id: string;
    scheduledAt: string;
    durationMin?: number | null;
  }) => void;
  onUpdateFields?: (params: {
    id: string;
    body: Partial<ItemRequest>;
  }) => void;
}

export function useMonthDrop(params: UseMonthDropParams = {}) {
  // Always call both default mutation hooks (stable hook order); custom handlers,
  // when given, simply take precedence at drop time.
  const defaultSchedule = useScheduleItem();
  const defaultUpdate = useUpdateItemFields();
  const { onSchedule, onUpdateFields } = params;

  const isPending = Boolean(
    params.isPending || defaultSchedule.isPending || defaultUpdate.isPending,
  );

  const handleDropOnDay = useCallback(
    (dragged: DragItemPayload, targetYmd: string) => {
      if (isPending) return;
      if (dragged.fromYmd === targetYmd) return;

      const item = dragged.item;
      // Determine which field placed it on the grid:
      // If dueAt matches fromYmd and scheduledAt does not, dueAt placed it.
      const placedBy =
        item.dueAt &&
        dateYmdIstanbul(item.dueAt) === dragged.fromYmd &&
        (!item.scheduledAt || dateYmdIstanbul(item.scheduledAt) !== dragged.fromYmd)
          ? "dueAt"
          : "scheduledAt";

      const patch = moveToDay(item, targetYmd, placedBy);

      if (patch.dueAt) {
        const args = { id: dragged.id, body: { dueAt: patch.dueAt } };
        if (onUpdateFields) onUpdateFields(args);
        else defaultUpdate.mutate(args);
      } else if (patch.scheduledAt) {
        const args = {
          id: dragged.id,
          scheduledAt: patch.scheduledAt,
          durationMin: item.durationMin,
        };
        if (onSchedule) onSchedule(args);
        else defaultSchedule.mutate(args);
      }
    },
    [isPending, onSchedule, onUpdateFields, defaultSchedule, defaultUpdate],
  );

  return { handleDropOnDay, isPending };
}

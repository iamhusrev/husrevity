import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reminderService } from "@/services/reminder-service";
import { ReminderListRequest, ReminderRequest } from "@/types/reminder/reminder";
import { ReorderItem } from "@/types/common/reorder";

const KEYS = {
  lists: ["reminder-lists"] as const,
  reminders: (listId: number) => ["reminders", listId] as const,
};

export function useReminderLists() {
  return useQuery({
    queryKey: KEYS.lists,
    queryFn: () => reminderService.listLists(),
    select: (d) => d.data,
  });
}

export function useCreateReminderList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReminderListRequest) => reminderService.createList(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.lists }),
  });
}

export function useUpdateReminderList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReminderListRequest }) =>
      reminderService.updateList(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.lists }),
  });
}

export function useDeleteReminderList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reminderService.deleteList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.lists }),
  });
}

export function useRestoreReminderList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reminderService.restoreList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.lists }),
  });
}

export function useReorderReminderLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => reminderService.reorderLists(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.lists }),
  });
}

export function useReminders(listId: number) {
  return useQuery({
    queryKey: KEYS.reminders(listId),
    queryFn: () => reminderService.listReminders(listId),
    select: (d) => d.data,
    enabled: listId > 0,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReminderRequest) => reminderService.create(body),
    onSuccess: (_, vars) => {
      if (vars.listId) qc.invalidateQueries({ queryKey: KEYS.reminders(vars.listId) });
      qc.invalidateQueries({ queryKey: KEYS.lists });
    },
  });
}

export function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ReminderRequest }) =>
      reminderService.update(id, body),
    onSuccess: (data) => {
      const listId = data.data?.listId;
      if (listId) qc.invalidateQueries({ queryKey: KEYS.reminders(listId) });
      qc.invalidateQueries({ queryKey: KEYS.lists });
    },
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, listId }: { id: number; listId: number }) => reminderService.remove(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.reminders(vars.listId) });
      qc.invalidateQueries({ queryKey: KEYS.lists });
    },
  });
}

export function useRestoreReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, listId }: { id: number; listId: number }) => reminderService.restore(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.reminders(vars.listId) });
      qc.invalidateQueries({ queryKey: KEYS.lists });
    },
  });
}

export function useToggleReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; listId: number }) => reminderService.toggle(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.reminders(vars.listId) });
      qc.invalidateQueries({ queryKey: KEYS.lists });
    },
  });
}

export function useReorderReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ items, listId }: { items: ReorderItem[]; listId: number }) =>
      reminderService.reorder(items),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.reminders(vars.listId) });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listService } from "@/services/list-service";
import {
  ListSectionRequest,
  TodoListItemRequest,
  TodoListRequest,
} from "@/types/list/list";
import { ReorderItem } from "@/types/common/reorder";

const LIST_KEYS = {
  all: ["lists"] as const,
  detail: (id: number) => ["lists", id] as const,
  items: (listId: number) => ["list-items", listId] as const,
  sections: (listId: number) => ["list-sections", listId] as const,
};

export function useTodoLists() {
  return useQuery({
    queryKey: LIST_KEYS.all,
    queryFn: () => listService.listLists(),
    select: (d) => d.data,
  });
}

export function useTodoList(id: number) {
  return useQuery({
    queryKey: LIST_KEYS.detail(id),
    queryFn: () => listService.getList(id),
    select: (d) => d.data,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateTodoList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TodoListRequest) => listService.createList(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEYS.all }),
  });
}

export function useUpdateTodoList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TodoListRequest }) =>
      listService.updateList(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.all });
      qc.invalidateQueries({ queryKey: LIST_KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteTodoList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => listService.deleteList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEYS.all }),
  });
}

export function useReorderTodoLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => listService.reorderLists(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEYS.all }),
  });
}

export function useTodoListItems(listId: number) {
  return useQuery({
    queryKey: LIST_KEYS.items(listId),
    queryFn: () => listService.listItems(listId),
    select: (d) => d.data,
    enabled: Number.isFinite(listId) && listId > 0,
  });
}

export function useCreateTodoListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, body }: { listId: number; body: TodoListItemRequest }) =>
      listService.createItem(listId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.items(vars.listId) });
    },
  });
}

export function useUpdateTodoListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; listId: number; body: TodoListItemRequest }) =>
      listService.updateItem(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.items(vars.listId) });
    },
  });
}

export function useToggleTodoListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; listId: number }) => listService.toggleItem(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.items(vars.listId) });
    },
  });
}

export function useDeleteTodoListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; listId: number }) => listService.deleteItem(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.items(vars.listId) });
    },
  });
}

export function useReorderTodoListItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, items }: { listId: number; items: ReorderItem[] }) =>
      listService.reorderItems(listId, items),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.items(vars.listId) });
    },
  });
}

export function useListSections(listId: number) {
  return useQuery({
    queryKey: LIST_KEYS.sections(listId),
    queryFn: () => listService.listSections(listId),
    select: (d) => d.data,
    enabled: Number.isFinite(listId) && listId > 0,
  });
}

export function useCreateListSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, body }: { listId: number; body: ListSectionRequest }) =>
      listService.createSection(listId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.sections(vars.listId) });
    },
  });
}

export function useUpdateListSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; listId: number; body: ListSectionRequest }) =>
      listService.updateSection(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.sections(vars.listId) });
    },
  });
}

export function useDeleteListSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; listId: number }) => listService.deleteSection(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.sections(vars.listId) });
      // Deleting a section ungroups its items — refresh items too.
      qc.invalidateQueries({ queryKey: LIST_KEYS.items(vars.listId) });
    },
  });
}

export function useReorderListSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, items }: { listId: number; items: ReorderItem[] }) =>
      listService.reorderSections(listId, items),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEYS.sections(vars.listId) });
    },
  });
}

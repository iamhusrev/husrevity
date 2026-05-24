import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteService } from "@/services/note-service";
import { NoteFilters, NoteRequest, TagRequest } from "@/types/note/note";
import { ReorderItem } from "@/types/common/reorder";

const NOTE_KEYS = {
  all: ["notes"] as const,
  list: (filters?: NoteFilters) => ["notes", "list", filters ?? {}] as const,
  detail: (id: number) => ["notes", id] as const,
  tags: ["note-tags"] as const,
};

export function useNotes(filters?: NoteFilters) {
  return useQuery({
    queryKey: NOTE_KEYS.list(filters),
    queryFn: () => noteService.list(filters),
    select: (data) => data.data,
  });
}

export function useNote(id: number) {
  return useQuery({
    queryKey: NOTE_KEYS.detail(id),
    queryFn: () => noteService.getById(id),
    select: (data) => data.data,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NoteRequest) => noteService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_KEYS.all }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: NoteRequest }) => noteService.update(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: NOTE_KEYS.all });
      qc.invalidateQueries({ queryKey: NOTE_KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => noteService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_KEYS.all }),
  });
}

export function useNoteTags() {
  return useQuery({
    queryKey: NOTE_KEYS.tags,
    queryFn: () => noteService.listTags(),
    select: (data) => data.data,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TagRequest) => noteService.createTag(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_KEYS.tags }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => noteService.deleteTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_KEYS.tags }),
  });
}

export function useReorderNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => noteService.reorder(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_KEYS.all }),
  });
}

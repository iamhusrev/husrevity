import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteLinkService } from "@/services/note-link-service";
import { CreateNoteLinkRequest, NoteLinkTargetType } from "@/types/note-link/note-link";
import { showErrorAlert } from "@/utils/mutation-error";

const NOTE_LINK_KEYS = {
  all: ["note-links"] as const,
  forNote: (noteId: string) => ["note-links", "note", noteId] as const,
  forTarget: (type: NoteLinkTargetType, id: string) => ["note-links", "target", type, id] as const,
};

export interface NoteLinkMutationOptions {
  /** The caller renders the error inside its dialog, so the hook raises no alert. */
  inlineErrors?: boolean;
}

export function useNoteLinks(noteId: string) {
  return useQuery({
    queryKey: NOTE_LINK_KEYS.forNote(noteId),
    queryFn: () => noteLinkService.listForNote(noteId),
    select: (d) => d.data,
    enabled: !!noteId,
  });
}

/** The caller's own notes linked to a goal/project/item. */
export function useNotesLinkedTo(type: NoteLinkTargetType, id: string) {
  return useQuery({
    queryKey: NOTE_LINK_KEYS.forTarget(type, id),
    queryFn: () => noteLinkService.notesLinkedTo(type, id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useAddNoteLink(noteId: string, options?: NoteLinkMutationOptions) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNoteLinkRequest) => noteLinkService.add(noteId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_LINK_KEYS.all }),
    onError: options?.inlineErrors ? undefined : showErrorAlert,
  });
}

export function useRemoveNoteLink(noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => noteLinkService.remove(noteId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTE_LINK_KEYS.all }),
    onError: showErrorAlert,
  });
}

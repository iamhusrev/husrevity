import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trashService } from "@/services/trash-service";
import { TrashEntry, TrashKind } from "@/types/trash/trash";

export const TRASH_KEYS = {
  all: ["trash"] as const,
  list: (kinds: readonly TrashKind[]) => ["trash", kinds] as const,
};

const PAGE_SIZE = 20;

/**
 * Query-key prefixes a restored entry makes stale, per kind. Prefix invalidation on purpose:
 * the trash screen cannot know which ranges, lists or details are cached elsewhere.
 * - task: project task lists and task details; items/today because the boards list tasks;
 *   goals because goal progress counts linked items.
 * - project: project lists/details, its task lists, and goal progress.
 * - reminder / reminder_list: reminders of a list plus the lists (they carry counts).
 * - calendar_event: event ranges and the event detail.
 * - goal: goal lists/details and items (item lists carry goal links).
 */
const DOMAIN_KEYS: Record<TrashKind, readonly (readonly string[])[]> = {
  task: [["project-tasks"], ["task"], ["items"], ["today"], ["goals"]],
  project: [["projects"], ["project-tasks"], ["goals"]],
  reminder: [["reminders"], ["reminder-lists"]],
  reminder_list: [["reminder-lists"], ["reminders"]],
  calendar_event: [["calendar-events"], ["calendar-event"]],
  goal: [["goals"], ["items"]],
};

/** Deleted entries of the given kinds (empty = all), newest first, paged by cursor. */
export function useTrash(kinds: readonly TrashKind[]) {
  return useInfiniteQuery({
    queryKey: TRASH_KEYS.list(kinds),
    queryFn: ({ pageParam }) =>
      trashService.listDeleted({
        kinds: [...kinds],
        limit: PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    // A null cursor marks the last page; returning it tells the query there is no next page.
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
}

/**
 * Restores one entry through its own `restorePath`. Errors are left to the caller: the screen
 * shows the server message (409 code clash, 403/404 project access) next to the row it keeps.
 */
export function useRestoreDeleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: TrashEntry) => trashService.restore(entry.restorePath),
    onSuccess: (_, entry) => {
      qc.invalidateQueries({ queryKey: TRASH_KEYS.all });
      for (const key of DOMAIN_KEYS[entry.kind]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

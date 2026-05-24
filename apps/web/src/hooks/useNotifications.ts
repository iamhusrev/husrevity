import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "@/services/notification-service";

const NOTIFICATION_KEYS = {
  all: ["notifications"] as const,
  list: (unread?: boolean) =>
    ["notifications", "list", unread ?? null] as const,
  unreadCount: ["notifications", "unread-count"] as const,
};

/**
 * Bell-dropdown feed. Polls every 30s so the badge stays current even when
 * the user hasn't granted Web Push permission (or the browser tab is the
 * only place push could surface). Faster polling isn't needed — backend
 * dispatcher runs at 60s cadence.
 */
export function useNotifications(opts: { unread?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.list(opts.unread),
    queryFn: () => notificationService.list(opts),
    select: (d) => d.data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.unreadCount,
    queryFn: () => notificationService.unreadCount(),
    select: (d) => d.data.unread,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all }),
  });
}

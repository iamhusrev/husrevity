/**
 * Tiny helpers shared by every domain module that emits notifications.
 * Kept here (not on NotificationService) so they can be used without
 * round-tripping through the DI graph for trivial date math.
 */

export function leadTimeFireAt(
  at: Date | null | undefined,
  minutesBefore: number | null | undefined,
): Date | null {
  if (!at || minutesBefore == null) return null;
  const fire = new Date(at.getTime() - minutesBefore * 60_000);
  if (Number.isNaN(fire.getTime())) return null;
  return fire;
}

/**
 * Build a body string that gives context without leaking content. Used by
 * domains that don't want to push the full notes/description text.
 */
export function formatLeadTimeBody(
  at: Date,
  minutesBefore: number,
  trailing?: string | null,
): string {
  if (minutesBefore <= 0) {
    return trailing ? trailing : 'Şimdi';
  }
  const hh = at
    .toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const head = `${hh}'de — ${minutesBefore} dk kaldı`;
  return trailing ? `${head}\n${trailing}` : head;
}

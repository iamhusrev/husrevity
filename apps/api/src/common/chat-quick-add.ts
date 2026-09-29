import { parseQuickAdd } from '@husrevity/parser';
import { ItemService } from '../item/item.service';
import { ReminderService } from '../reminder/reminder.service';

export interface ChatQuickAddResult {
  kind: 'reminder' | 'task';
  title: string;
  dueAt: string | null;
}

/**
 * Turns a chat message (Telegram / Slack) into a reminder for `ownerId`.
 *
 * A reminder fires at its due time (`notifyMinutesBefore: 0`) and shows up on
 * the web Reminders page. Reminders cannot recur, so a message that parses to a
 * recurring rule is stored as a recurring Item task instead — silently dropping
 * the recurrence would be worse than a different entity type.
 */
export async function addFromChatMessage(
  reminderService: ReminderService,
  itemService: ItemService,
  ownerId: string,
  text: string,
  source: 'telegram' | 'slack',
): Promise<ChatQuickAddResult> {
  const draft = await parseQuickAdd(text);
  const dueAt = draft.scheduledAt ?? null;

  if (draft.rrule) {
    const item = await itemService.create(ownerId, {
      kind: 'task',
      title: draft.title,
      context: draft.context ?? null,
      scheduledAt: dueAt,
      rrule: draft.rrule,
      source,
    });
    return { kind: 'task', title: item.title, dueAt };
  }

  const reminder = await reminderService.createReminder(ownerId, {
    title: draft.title,
    dueAt: dueAt ?? undefined,
    notifyMinutesBefore: dueAt ? 0 : null,
  });
  return { kind: 'reminder', title: reminder.title, dueAt };
}

/** Human-readable Europe/Istanbul timestamp for bot replies, e.g. "30 Eyl 09:00". */
export function formatDueForChat(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function chatQuickAddReply(r: ChatQuickAddResult): string {
  const when = r.dueAt ? ` — ${formatDueForChat(r.dueAt)}` : '';
  return r.kind === 'reminder'
    ? `⏰ Anımsatıcı eklendi: "${r.title}"${when}`
    : `🔁 Tekrarlayan görev eklendi: "${r.title}"${when}`;
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every reminder/task/calendar-event/time-block created before the web UI
 * exposed a lead-time picker has `notify_minutes_before` (or, for calendar
 * events, `reminder_minutes`) permanently NULL — `leadTimeFireAt()`
 * (notification-scheduling.ts) short-circuits on a null lead-time, so
 * `syncNotification()` never enqueues a row for any of them. This is why no
 * notification has ever fired: not a dispatcher bug, a data bug.
 *
 * This migration defaults the column to `0` (fire exactly at the due/start
 * time) for still-*future*, not-yet-completed rows only. It intentionally
 * does NOT touch:
 *   - past-due rows (nothing to gain from scheduling a notification for a
 *     time that already happened — it would just fire immediately on the
 *     next dispatcher tick, which is not what "backfill" should do)
 *   - completed/done rows (`reminder.completed_at`, `task.status`,
 *     `time_block.completed_at` — calendar_event has no completion concept)
 *   - soft-deleted rows
 *
 * This column update alone does NOT create any `notification` rows — the
 * app process must still run each domain's `syncNotification()` for that
 * (see `NotificationResyncService` / `POST /api/notifications/resync`,
 * exposed in the Settings → Notifications panel as "Bildirimleri yeniden
 * kur"). Column defaults here only make sure *future* app-side resyncs (and
 * any edit-driven syncNotification call) have a non-null lead-time to work
 * with.
 */
export class BackfillNotifyLeadTime1715000019000 implements MigrationInterface {
  name = 'BackfillNotifyLeadTime1715000019000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE reminder
         SET notify_minutes_before = 0
       WHERE notify_minutes_before IS NULL
         AND due_at IS NOT NULL
         AND due_at > now()
         AND completed_at IS NULL
         AND deleted_at IS NULL
    `);

    await qr.query(`
      UPDATE task
         SET notify_minutes_before = 0
       WHERE notify_minutes_before IS NULL
         AND due_at IS NOT NULL
         AND due_at > now()
         AND status NOT IN ('DONE', 'COMPLETED', 'CANCELLED')
         AND deleted_at IS NULL
    `);

    await qr.query(`
      UPDATE calendar_event
         SET reminder_minutes = 0
       WHERE reminder_minutes IS NULL
         AND start_at > now()
         AND deleted_at IS NULL
    `);

    await qr.query(`
      UPDATE time_block
         SET notify_minutes_before = 0
       WHERE notify_minutes_before IS NULL
         AND start_at > now()
         AND completed_at IS NULL
         AND deleted_at IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Deliberately irreversible: rows this migration touched are
    // indistinguishable from rows a user genuinely set to `0` afterwards
    // (both look like `notify_minutes_before = 0`), so there is nothing
    // safe to revert back to NULL.
  }
}

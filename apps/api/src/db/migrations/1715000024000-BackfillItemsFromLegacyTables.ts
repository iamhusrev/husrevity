import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotent backfill of every legacy source table into `items` (see
 * docs/inventory.md for the full inventory and the plan file for the
 * per-source mapping rationale). Every INSERT is guarded by
 * `ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL
 * AND deleted_at IS NULL DO NOTHING` against `uq_items_legacy_source`, so
 * re-running this migration (or re-running the same statements by hand for
 * a hotfix) never creates duplicate rows.
 *
 * Two-pass ordering matters for routine: `routine_segment` rows are
 * inserted first, then `routine_activity` rows look up their migrated
 * parent's *new* items.id via legacy_table/legacy_id to populate block_id.
 * Both passes run in the same transaction, so the second SELECT sees the
 * first INSERT's rows.
 *
 * Not migrated (organizational containers / settings, not actionable
 * units): learning_topic, learning_subtopic, sport_profile, sport_program.
 * `sport_session` rows with a NULL program_id (no reachable owner) are
 * skipped rather than migrated with a guessed owner.
 */
export class BackfillItemsFromLegacyTables1715000024000 implements MigrationInterface {
  name = 'BackfillItemsFromLegacyTables1715000024000';

  public async up(qr: QueryRunner): Promise<void> {
    // ─── task ──────────────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, title, notes, project_id, due_at, notify_minutes_before,
        status, payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        t.owner_id, 'task', t.title, t.description, t.project_id, t.due_at, t.notify_minutes_before,
        CASE
          WHEN t.status = 'CANCELLED' THEN 'cancelled'
          WHEN t.status IN ('DONE', 'COMPLETED') THEN 'done'
          ELSE 'open'
        END,
        jsonb_strip_nulls(jsonb_build_object('assigneeId', t.assignee_id)),
        'task', t.id, t.created_at, t.created_by_id, t.updated_at, t.updated_by_id
      FROM task t
      WHERE t.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── reminder ──────────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, title, notes, due_at, notify_minutes_before,
        status, payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        r.owner_id, 'task', r.title, r.notes, r.due_at, r.notify_minutes_before,
        CASE WHEN r.completed_at IS NOT NULL THEN 'done' ELSE 'open' END,
        jsonb_strip_nulls(jsonb_build_object('listId', r.list_id, 'priority', r.priority, 'flag', r.flag)),
        'reminder', r.id, r.created_at, r.created_by_id, r.updated_at, r.updated_by_id
      FROM reminder r
      WHERE r.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── calendar_event ────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, title, notes, scheduled_at, duration_min, notify_minutes_before, rrule,
        payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        c.owner_id, 'event', c.title, c.description, c.start_at,
        CAST(EXTRACT(EPOCH FROM (c.end_at - c.start_at)) / 60 AS INTEGER),
        c.reminder_minutes, c.recurrence_rule,
        jsonb_strip_nulls(jsonb_build_object('allDay', c.all_day, 'location', c.location, 'colorHex', c.color_hex)),
        'calendar_event', c.id, c.created_at, c.created_by_id, c.updated_at, c.updated_by_id
      FROM calendar_event c
      WHERE c.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── routine_segment (Evkat template) — pass 1 ────────────────────────
    // daysOfWeek bitmask (bit0=Mon..bit6=Sun, 127=every day) -> RFC5545 rrule.
    // Anchor scheduled_at at a real Monday (2018-01-01, well after Turkey's
    // 2016 DST abolition) + start_minute, interpreted as Europe/Istanbul
    // wall-clock and converted to UTC for storage.
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, title, notes, scheduled_at, duration_min, rrule,
        payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        rs.owner_id, 'event', rs.name, rs.notes,
        (DATE '2018-01-01'::timestamp + (COALESCE(rs.start_minute, 0) * INTERVAL '1 minute')) AT TIME ZONE 'Europe/Istanbul',
        CASE WHEN rs.start_minute IS NOT NULL AND rs.end_minute IS NOT NULL
          THEN rs.end_minute - rs.start_minute ELSE NULL END,
        CASE
          WHEN rs.days_of_week = 127 THEN 'FREQ=DAILY'
          ELSE 'FREQ=WEEKLY;BYDAY=' || (
            SELECT string_agg(d.code, ',' ORDER BY d.bit)
            FROM (VALUES (0,'MO'),(1,'TU'),(2,'WE'),(3,'TH'),(4,'FR'),(5,'SA'),(6,'SU')) AS d(bit, code)
            WHERE (rs.days_of_week & (1 << d.bit)) <> 0
          )
        END,
        jsonb_strip_nulls(jsonb_build_object('theme', rs.theme, 'colorToken', rs.color_token)),
        'routine_segment', rs.id, rs.created_at, rs.created_by_id, rs.updated_at, rs.updated_by_id
      FROM routine_segment rs
      WHERE rs.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── routine_activity (Evkat "iş") — pass 2, needs pass 1 committed ───
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, title, block_id, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        parent.owner_id, 'task', ra.text, parent.id,
        'routine_activity', ra.id, ra.created_at, ra.created_by_id, ra.updated_at, ra.updated_by_id
      FROM routine_activity ra
      JOIN routine_segment rs ON rs.id = ra.segment_id
      JOIN items parent ON parent.legacy_table = 'routine_segment' AND parent.legacy_id = rs.id
      WHERE ra.deleted_at IS NULL AND rs.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── time_block (Evkat concrete occurrence) ───────────────────────────
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, title, notes, scheduled_at, duration_min, notify_minutes_before,
        status, completed_at, payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        tb.owner_id, 'event', tb.title, tb.notes, tb.start_at,
        CAST(EXTRACT(EPOCH FROM (tb.end_at - tb.start_at)) / 60 AS INTEGER),
        tb.notify_minutes_before,
        CASE WHEN tb.completed_at IS NOT NULL THEN 'done' ELSE 'open' END,
        tb.completed_at,
        jsonb_strip_nulls(jsonb_build_object('category', tb.category, 'colorToken', tb.color_token)),
        'time_block', tb.id, tb.created_at, tb.created_by_id, tb.updated_at, tb.updated_by_id
      FROM time_block tb
      WHERE tb.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── learning_item (learning_topic/subtopic are containers, not items) ─
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, context, title, notes, due_at, notify_minutes_before,
        status, completed_at, payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        lt.owner_id, 'task', 'ogrenme', li.text, li.notes, li.review_at, li.notify_minutes_before,
        CASE WHEN li.completed_at IS NOT NULL THEN 'done' ELSE 'open' END,
        li.completed_at,
        jsonb_strip_nulls(jsonb_build_object(
          'url', li.url, 'estimatedMinutes', li.estimated_minutes,
          'topicTitle', lt.title, 'subtopicTitle', ls.title
        )),
        'learning_item', li.id, li.created_at, li.created_by_id, li.updated_at, li.updated_by_id
      FROM learning_item li
      JOIN learning_topic lt ON lt.id = li.topic_id
      LEFT JOIN learning_subtopic ls ON ls.id = li.subtopic_id
      WHERE li.deleted_at IS NULL AND lt.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── sport_session (planned slot; sport_profile/sport_program are ─────
    // containers, not migrated). plannedDayOfWeek (0-6, Monday-based, same
    // convention as routine_segment's bitmask) -> a single-day WEEKLY rrule
    // anchored at the same synthetic Monday, at midnight Istanbul (no
    // time-of-day data exists on sport_session). Rows with no program_id
    // have no reachable owner and are skipped.
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, context, title, notes, duration_min, scheduled_at, rrule,
        payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        sp.owner_id, 'event', 'spor', COALESCE(NULLIF(ss.name, ''), ss.activity_type), ss.description,
        ss.planned_duration,
        (DATE '2018-01-01'::timestamp) AT TIME ZONE 'Europe/Istanbul',
        'FREQ=WEEKLY;BYDAY=' || (
          SELECT d.code FROM (VALUES (0,'MO'),(1,'TU'),(2,'WE'),(3,'TH'),(4,'FR'),(5,'SA'),(6,'SU')) AS d(bit, code)
          WHERE d.bit = ss.planned_day_of_week
        ),
        jsonb_strip_nulls(jsonb_build_object(
          'activityType', ss.activity_type, 'location', ss.location,
          'difficulty', ss.difficulty, 'plannedDayOfWeek', ss.planned_day_of_week
        )),
        'sport_session', ss.id, ss.created_at, ss.created_by_id, ss.updated_at, ss.updated_by_id
      FROM sport_session ss
      JOIN sport_program sp ON sp.id = ss.program_id
      WHERE ss.deleted_at IS NULL AND sp.deleted_at IS NULL AND ss.program_id IS NOT NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);

    // ─── sport_log (executed record) ──────────────────────────────────────
    await qr.query(`
      INSERT INTO items (
        owner_id, kind, context, title, scheduled_at, duration_min,
        status, payload, legacy_table, legacy_id, created_at, created_by_id, updated_at, updated_by_id
      )
      SELECT
        sl.owner_id, 'log', 'spor', COALESCE(ss.name, ss.activity_type, 'Spor kaydı'),
        sl.executed_date::timestamp AT TIME ZONE 'Europe/Istanbul',
        sl.actual_duration,
        CASE WHEN sl.completed THEN 'done' ELSE 'open' END,
        jsonb_strip_nulls(jsonb_build_object(
          'sessionId', sl.session_id, 'intensity', sl.intensity, 'caloriesBurned', sl.calories_burned
        )),
        'sport_log', sl.id, sl.created_at, sl.created_by_id, sl.updated_at, sl.updated_by_id
      FROM sport_log sl
      LEFT JOIN sport_session ss ON ss.id = sl.session_id
      WHERE sl.deleted_at IS NULL
      ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL AND deleted_at IS NULL DO NOTHING
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM items WHERE legacy_table IS NOT NULL`);
  }
}

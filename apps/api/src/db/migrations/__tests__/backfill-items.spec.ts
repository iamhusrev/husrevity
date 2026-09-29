import 'reflect-metadata';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { BackfillItemsFromLegacyTables1715000024000 } from '../1715000024000-BackfillItemsFromLegacyTables';

async function runBackfill(dataSource: DataSource): Promise<void> {
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  try {
    await new BackfillItemsFromLegacyTables1715000024000().up(qr);
  } finally {
    await qr.release();
  }
}

/**
 * Real-Postgres integration test for the Item backfill (Faz 1). Runs every
 * migration (Baseline through BackfillItemsFromLegacyTables) against a
 * disposable testcontainer — never against the shared homelab dev
 * database — then asserts the trickiest mapping cases: owner resolution
 * through a parent table, block_id re-pointing at a migrated parent's new
 * id, and idempotency on re-run.
 *
 * No entities are registered (`entities: []`) — migrations run via raw
 * QueryRunner SQL, independent of entity metadata, and every fixture/
 * assertion in this test uses `dataSource.query()` directly.
 */
jest.setTimeout(180_000);

describe('BackfillItemsFromLegacyTables (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let ownerId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [],
      migrations: [join(__dirname, '..', '*.{ts,js}')],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, password_hash) VALUES ('fixture@example.com', 'x') RETURNING id`,
    );
    ownerId = user.id;

    await dataSource.query(
      `INSERT INTO task (owner_id, title, description, status, due_at) VALUES ($1, 'Rapor teslim et', 'Q3 raporu', 'TODO', now() + interval '1 day')`,
      [ownerId],
    );

    await dataSource.query(
      `INSERT INTO reminder (owner_id, title, completed_at) VALUES ($1, 'Eczaneden ilaç al', now())`,
      [ownerId],
    );

    await dataSource.query(
      `INSERT INTO calendar_event (owner_id, title, start_at, end_at, recurrence_rule)
       VALUES ($1, 'Ekip toplantısı', now(), now() + interval '30 minutes', 'FREQ=WEEKLY;BYDAY=MO')`,
      [ownerId],
    );

    // Mon/Wed/Fri = bits 0,2,4 -> 1 + 4 + 16 = 21.
    const [segment] = await dataSource.query(
      `INSERT INTO routine_segment (owner_id, name, start_minute, end_minute, days_of_week)
       VALUES ($1, 'Güne Hazırlık', 360, 480, 21) RETURNING id`,
      [ownerId],
    );
    await dataSource.query(
      `INSERT INTO routine_activity (segment_id, text) VALUES ($1, 'Kuran ve Cevşen')`,
      [segment.id],
    );

    await dataSource.query(
      `INSERT INTO time_block (owner_id, title, start_at, end_at, completed_at)
       VALUES ($1, 'Odaklı çalışma', now(), now() + interval '2 hours', now())`,
      [ownerId],
    );

    const [topic] = await dataSource.query(
      `INSERT INTO learning_topic (owner_id, title) VALUES ($1, 'Rust') RETURNING id`,
      [ownerId],
    );
    const [subtopic] = await dataSource.query(
      `INSERT INTO learning_subtopic (topic_id, title) VALUES ($1, 'Ownership') RETURNING id`,
      [topic.id],
    );
    await dataSource.query(
      `INSERT INTO learning_item (topic_id, subtopic_id, text, review_at)
       VALUES ($1, $2, 'Borrow checker örnekleri', now() + interval '3 days')`,
      [topic.id, subtopic.id],
    );

    const [program] = await dataSource.query(
      `INSERT INTO sport_program (owner_id, name, week_count, start_date) VALUES ($1, 'Yaz programı', 8, CURRENT_DATE) RETURNING id`,
      [ownerId],
    );
    const [session] = await dataSource.query(
      `INSERT INTO sport_session (program_id, activity_type, location, name, planned_day_of_week, planned_duration, description)
       VALUES ($1, 'RUNNING', 'DIS', 'Sabah koşusu', 2, 30, 'Parkta koşu') RETURNING id`,
      [program.id],
    );
    await dataSource.query(
      `INSERT INTO sport_log (owner_id, session_id, executed_date, actual_duration, completed, intensity)
       VALUES ($1, $2, CURRENT_DATE, 28, true, 7)`,
      [ownerId, session.id],
    );

    // Orphaned session (no program) — must be SKIPPED, not migrated with a guessed owner.
    await dataSource.query(
      `INSERT INTO sport_session (program_id, activity_type, location, name, planned_day_of_week, planned_duration, description)
       VALUES (NULL, 'YOGA', 'EV', 'Orphan session', 5, 45, 'no reachable owner')`,
    );

    // runMigrations() already ran the backfill once, but against EMPTY source
    // tables (the fixtures above didn't exist yet) — a harmless no-op. This
    // is the first backfill run against real data; the "idempotent" test
    // below runs it a second time and asserts zero additional rows.
    await runBackfill(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('migrates every source table into items with the correct kind/context', async () => {
    const rows: Array<{ kind: string; context: string | null; legacy_table: string }> =
      await dataSource.query(
        `SELECT kind, context, legacy_table FROM items WHERE owner_id = $1 ORDER BY legacy_table`,
        [ownerId],
      );
    const byTable = new Map(rows.map((r) => [r.legacy_table, r]));

    expect(byTable.get('task')).toMatchObject({ kind: 'task', context: null });
    expect(byTable.get('reminder')).toMatchObject({ kind: 'task', context: null });
    expect(byTable.get('calendar_event')).toMatchObject({ kind: 'event', context: null });
    expect(byTable.get('routine_segment')).toMatchObject({ kind: 'event', context: null });
    expect(byTable.get('routine_activity')).toMatchObject({ kind: 'task', context: null });
    expect(byTable.get('time_block')).toMatchObject({ kind: 'event', context: null });
    expect(byTable.get('learning_item')).toMatchObject({ kind: 'task', context: 'ogrenme' });
    expect(byTable.get('sport_session')).toMatchObject({ kind: 'event', context: 'spor' });
    expect(byTable.get('sport_log')).toMatchObject({ kind: 'log', context: 'spor' });

    // learning_topic/learning_subtopic/sport_program are containers, not migrated.
    expect(byTable.has('learning_topic')).toBe(false);
    expect(byTable.has('sport_program')).toBe(false);
  });

  it('never migrates a status-completion table row as an item status other than done/open correctly', async () => {
    const [reminderItem] = await dataSource.query(
      `SELECT status FROM items WHERE legacy_table = 'reminder' AND owner_id = $1`,
      [ownerId],
    );
    expect(reminderItem.status).toBe('done'); // completed_at was set on the fixture

    const [taskItem] = await dataSource.query(
      `SELECT status FROM items WHERE legacy_table = 'task' AND owner_id = $1`,
      [ownerId],
    );
    expect(taskItem.status).toBe('open'); // TODO status
  });

  it("derives the routine_segment's rrule from its days_of_week bitmask", async () => {
    const [segmentItem] = await dataSource.query(
      `SELECT rrule, duration_min FROM items WHERE legacy_table = 'routine_segment' AND owner_id = $1`,
      [ownerId],
    );
    expect(segmentItem.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(segmentItem.duration_min).toBe(120); // 480 - 360
  });

  it("re-points routine_activity.block_id at its migrated parent's NEW items.id", async () => {
    const [segmentItem] = await dataSource.query(
      `SELECT id FROM items WHERE legacy_table = 'routine_segment' AND owner_id = $1`,
      [ownerId],
    );
    const [activityItem] = await dataSource.query(
      `SELECT block_id, owner_id FROM items WHERE legacy_table = 'routine_activity' AND owner_id = $1`,
      [ownerId],
    );
    expect(activityItem.block_id).toBe(segmentItem.id);
    expect(activityItem.owner_id).toBe(ownerId); // resolved via the parent segment, no direct owner column on routine_activity
  });

  it("resolves sport_session's owner through sport_program and derives a single-day WEEKLY rrule", async () => {
    const [sessionItem] = await dataSource.query(
      `SELECT owner_id, rrule FROM items WHERE legacy_table = 'sport_session' AND owner_id = $1`,
      [ownerId],
    );
    expect(sessionItem.owner_id).toBe(ownerId); // resolved via sport_program.owner_id, no direct owner column
    expect(sessionItem.rrule).toBe('FREQ=WEEKLY;BYDAY=WE'); // planned_day_of_week = 2

    const orphanCount = await dataSource.query(
      `SELECT count(*) FROM items WHERE legacy_table = 'sport_session' AND owner_id IS NULL`,
    );
    // Sanity: the orphaned (program_id IS NULL) session must not exist as an item at all.
    const totalSportSessions = await dataSource.query(
      `SELECT count(*) FROM items WHERE legacy_table = 'sport_session'`,
    );
    expect(Number(totalSportSessions[0].count)).toBe(1); // only the one with a reachable owner
    expect(Number(orphanCount[0].count)).toBe(0);
  });

  it("resolves learning_item's owner through learning_topic and denormalizes topic/subtopic titles into payload", async () => {
    const [learningItem] = await dataSource.query(
      `SELECT owner_id, payload FROM items WHERE legacy_table = 'learning_item' AND owner_id = $1`,
      [ownerId],
    );
    expect(learningItem.owner_id).toBe(ownerId);
    expect(learningItem.payload).toMatchObject({ topicTitle: 'Rust', subtopicTitle: 'Ownership' });
  });

  it('copies calendar_event.recurrence_rule verbatim with zero conversion', async () => {
    const [eventItem] = await dataSource.query(
      `SELECT rrule FROM items WHERE legacy_table = 'calendar_event' AND owner_id = $1`,
      [ownerId],
    );
    expect(eventItem.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('is idempotent: re-running up() against the same data inserts zero additional rows', async () => {
    const before = await dataSource.query(`SELECT count(*) FROM items`);
    const beforeCount = Number(before[0].count);

    await runBackfill(dataSource);

    const after = await dataSource.query(`SELECT count(*) FROM items`);
    expect(Number(after[0].count)).toBe(beforeCount);
  });
});

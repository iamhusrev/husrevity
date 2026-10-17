import 'reflect-metadata';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { SyncService } from './sync.service';
import { NoteService } from '../note/note.service';
import { Item } from '../item/item.entity';
import { ItemOccurrence } from '../item/item-occurrence.entity';
import { Note } from '../note/note.entity';
import { NoteTag } from '../note/note-tag.entity';
import { Project } from '../project/project.entity';
import { Goal } from '../goal/goal.entity';

/**
 * Real-Postgres check of the assumption the whole offline sync rests on: soft-deleting a row
 * advances its `updated_at`, so `GET /sync?since=` reports it as a tombstone. The unit specs mock
 * the repositories and cannot see this. Runs every migration against a disposable testcontainer,
 * never against a shared database.
 */
jest.setTimeout(180_000);

describe('SyncService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let service: SyncService;
  let alice: string;
  let bob: string;

  const dbNow = async (): Promise<Date> => {
    const [row] = await dataSource.query(`SELECT clock_timestamp() AS now`);
    return new Date(row.now);
  };

  const seed = async (ownerId: string, tag: string) => {
    const item = await dataSource.getRepository(Item).save(
      dataSource.getRepository(Item).create({
        ownerId,
        kind: 'task',
        title: `${tag} item`,
        status: 'open',
        payload: {},
      }),
    );
    const occurrence = await dataSource.getRepository(ItemOccurrence).save(
      dataSource.getRepository(ItemOccurrence).create({
        itemId: item.id,
        ownerId,
        occursOn: '2026-02-03',
        status: 'done',
        completedAt: new Date(),
      }),
    );
    const noteTag = await dataSource
      .getRepository(NoteTag)
      .save(dataSource.getRepository(NoteTag).create({ ownerId, name: `${tag}-tag`, color: null }));
    const note = await dataSource
      .getRepository(Note)
      .save(
        dataSource.getRepository(Note).create({ ownerId, title: `${tag} note`, tags: [noteTag] }),
      );
    const project = await dataSource
      .getRepository(Project)
      .save(
        dataSource.getRepository(Project).create({ ownerId, code: tag.toUpperCase(), name: tag }),
      );
    const goal = await dataSource.getRepository(Goal).save(
      dataSource.getRepository(Goal).create({
        ownerId,
        title: `${tag} goal`,
        horizon: 'month',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        status: 'active',
      }),
    );
    return { item, occurrence, noteTag, note, project, goal };
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
      migrations: [join(__dirname, '..', 'db', 'migrations', '*.{ts,js}')],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const [a] = await dataSource.query(
      `INSERT INTO app_user (email, password_hash) VALUES ('alice@example.com', 'x') RETURNING id`,
    );
    const [b] = await dataSource.query(
      `INSERT INTO app_user (email, password_hash) VALUES ('bob@example.com', 'x') RETURNING id`,
    );
    alice = a.id;
    bob = b.id;

    service = new SyncService(
      dataSource.getRepository(Item),
      dataSource.getRepository(Note),
      dataSource.getRepository(Project),
      dataSource.getRepository(Goal),
      dataSource.getRepository(ItemOccurrence),
      dataSource.getRepository(NoteTag),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('migration creates an (owner_id, updated_at) index on every synced table', async () => {
    const rows: { indexname: string }[] = await dataSource.query(
      `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx\\_%\\_owner\\_updated'`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'idx_goal_owner_updated',
      'idx_item_occurrences_owner_updated',
      'idx_items_owner_updated',
      'idx_note_owner_updated',
      'idx_note_tag_owner_updated',
      'idx_project_owner_updated',
    ]);
  });

  it("a full sync returns the owner's live rows of every kind and nobody else's", async () => {
    const mine = await seed(alice, 'alice');
    await seed(bob, 'bob');

    const result = await service.syncSince(alice, null);

    expect(result.items.live.map((r) => r.id)).toEqual([mine.item.id]);
    expect(result.itemOccurrences.live.map((r) => r.id)).toEqual([mine.occurrence.id]);
    expect(result.notes.live.map((r) => r.id)).toEqual([mine.note.id]);
    expect(result.noteTags.live.map((r) => r.id)).toEqual([mine.noteTag.id]);
    expect(result.projects.live.map((r) => r.id)).toEqual([mine.project.id]);
    expect(result.goals.live.map((r) => r.id)).toEqual([mine.goal.id]);
    for (const delta of [
      result.items,
      result.itemOccurrences,
      result.notes,
      result.noteTags,
      result.projects,
      result.goals,
    ]) {
      expect(delta.tombstoneIds).toEqual([]);
    }
  });

  it('soft-deleting any synced row advances updated_at and yields exactly one tombstone', async () => {
    const mine = await seed(alice, 'carol');
    const before = await dbNow();

    await dataSource.getRepository(ItemOccurrence).softRemove(mine.occurrence);
    await dataSource.getRepository(Item).softRemove(mine.item);
    await dataSource.getRepository(Note).softRemove(mine.note);
    await dataSource.getRepository(NoteTag).softRemove(mine.noteTag);
    await dataSource.getRepository(Project).softRemove(mine.project);
    await dataSource.getRepository(Goal).softRemove(mine.goal);

    const result = await service.syncSince(alice, before);

    expect(result.items.tombstoneIds).toEqual([mine.item.id]);
    expect(result.itemOccurrences.tombstoneIds).toEqual([mine.occurrence.id]);
    expect(result.notes.tombstoneIds).toEqual([mine.note.id]);
    expect(result.noteTags.tombstoneIds).toEqual([mine.noteTag.id]);
    expect(result.projects.tombstoneIds).toEqual([mine.project.id]);
    expect(result.goals.tombstoneIds).toEqual([mine.goal.id]);
    // A deleted row is a tombstone only, never also a live row.
    expect(result.items.live.map((r) => r.id)).not.toContain(mine.item.id);
    expect(result.goals.live.map((r) => r.id)).not.toContain(mine.goal.id);
  });

  it('an incremental sync after the cursor returns nothing when nothing changed', async () => {
    const first = await service.syncSince(alice, null);
    const second = await service.syncSince(alice, new Date(first.cursor));

    expect(second.items.live).toEqual([]);
    expect(second.goals.live).toEqual([]);
    expect(second.items.tombstoneIds).toEqual([]);
  });

  it('a deleted tag name can be created again, while a live duplicate is still rejected', async () => {
    const tags = dataSource.getRepository(NoteTag);
    const first = await tags.save(tags.create({ ownerId: alice, name: 'reuse', color: null }));
    await tags.softRemove(first);

    await expect(
      tags.save(tags.create({ ownerId: alice, name: 'reuse', color: null })),
    ).resolves.toBeDefined();
    await expect(
      tags.save(tags.create({ ownerId: alice, name: 'reuse', color: null })),
    ).rejects.toThrow(/uq_note_tag_owner_name_live|duplicate key/);
  });

  describe('deleting a tag that notes carry', () => {
    let notes: NoteService;
    let tagId: string;
    let noteId: string;
    let noteUpdatedBefore: Date;

    beforeAll(async () => {
      notes = new NoteService(
        dataSource.getRepository(Note),
        dataSource.getRepository(NoteTag),
        dataSource,
      );
      const tag = await notes.createTag(alice, { name: 'carried' });
      tagId = tag.id;
      const note = await notes.create(alice, { title: 'tagged', tagIds: [tagId] });
      noteId = note.id;
      const [row] = await dataSource.query(`SELECT updated_at FROM note WHERE id = $1`, [noteId]);
      noteUpdatedBefore = new Date(row.updated_at);
    });

    it('filtering notes by the deleted tag returns nothing', async () => {
      expect((await notes.list(alice, undefined, tagId, undefined)).map((n) => n.id)).toEqual([
        noteId,
      ]);

      await notes.deleteTag(alice, tagId);

      expect(await notes.list(alice, undefined, tagId, undefined)).toEqual([]);
    });

    it('bumps the carrying note so an incremental sync re-sends it without the tag', async () => {
      const [row] = await dataSource.query(`SELECT updated_at FROM note WHERE id = $1`, [noteId]);
      expect(new Date(row.updated_at).getTime()).toBeGreaterThan(noteUpdatedBefore.getTime());

      const result = await service.syncSince(alice, noteUpdatedBefore);

      expect(result.noteTags.tombstoneIds).toContain(tagId);
      const resent = result.notes.live.find((n) => n.id === noteId);
      expect(resent).toBeDefined();
      expect((resent!.tags ?? []).map((t) => t.id)).not.toContain(tagId);
    });
  });

  it('the database accepts items created by the native macOS client', async () => {
    const items = dataSource.getRepository(Item);
    const saved = await items.save(
      items.create({
        ownerId: alice,
        kind: 'task',
        title: 'from the Mac',
        status: 'open',
        payload: {},
        source: 'macos',
      }),
    );
    expect(saved.id).toBeDefined();
  });

  // Last on purpose: it reverts and re-applies the most recent migrations.
  it('the migration reverts cleanly even when a deleted and a live tag share a name', async () => {
    const tags = dataSource.getRepository(NoteTag);
    const gone = await tags.save(tags.create({ ownerId: alice, name: 'dup', color: null }));
    await tags.softRemove(gone);
    await tags.save(tags.create({ ownerId: alice, name: 'dup', color: null }));

    // Two migrations sit on top of the tag change: undo both, newest first.
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();

    const constraints: { conname: string }[] = await dataSource.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'uq_note_tag_owner_name'`,
    );
    expect(constraints).toHaveLength(1);
    const [live] = await dataSource.query(
      `SELECT count(*)::int AS n FROM note_tag WHERE owner_id = $1 AND name = 'dup' AND deleted_at IS NULL`,
      [alice],
    );
    expect(live.n).toBe(1);

    await dataSource.runMigrations();
    const [idx] = await dataSource.query(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'uq_note_tag_owner_name_live'`,
    );
    expect(idx.n).toBe(1);
  });
});

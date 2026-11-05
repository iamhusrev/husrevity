import 'reflect-metadata';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ApiException } from '../../common/api.exception';
import { applyLearningUndo, UndoContext } from '../../change-set/learning-undo';
import { ChangeEntry } from '../../change-set/entities/change-entry.entity';
import { TrashService } from '../../trash/trash.service';
import { LearningItem } from '../learning-item.entity';
import { LearningSubtopic } from '../learning-subtopic.entity';
import { LearningTopic } from '../learning-topic.entity';
import { LearningService } from '../learning.service';

/**
 * Real-Postgres checks for ordering, moving, delete/restore, undo and trash of learning rows.
 * The unit specs mock the query builder, so they cannot see SQL mistakes (a wrong column, a
 * subselect that never matches, a CHECK constraint that rejects the new target types). Runs every
 * migration against a disposable testcontainer, never against a shared database.
 */
jest.setTimeout(240_000);

describe('Learning ordering (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let service: LearningService;
  let trash: TrashService;
  let alice: string;
  let bob: string;

  const topicIds = async (owner: string) => (await service.listTopics(owner)).map((t) => t.id);
  const positions = async (table: string, where: string, params: unknown[]) =>
    (
      await dataSource.query(
        `SELECT id, position FROM ${table} WHERE ${where} AND deleted_at IS NULL ORDER BY position, id`,
        params,
      )
    ).map((r: { id: string; position: number }) => [r.id, r.position]);

  const newTopic = async (owner: string, title: string, year?: number) =>
    (await service.createTopic(owner, { title, year })).id;
  const bad = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ApiException);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [join(__dirname, '..', '..', '**', '*.entity.{ts,js}')],
      migrations: [join(__dirname, '..', '..', 'db', 'migrations', '*.{ts,js}')],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const user = async (email: string) =>
      (
        await dataSource.query(
          `INSERT INTO app_user (email, password_hash) VALUES ($1, 'x') RETURNING id`,
          [email],
        )
      )[0].id as string;
    alice = await user('alice@example.com');
    bob = await user('bob@example.com');

    const notifications = {
      cancelForSource: async () => undefined,
      enqueue: async () => undefined,
    };
    service = new LearningService(
      dataSource.getRepository(LearningTopic),
      dataSource.getRepository(LearningSubtopic),
      dataSource.getRepository(LearningItem),
      dataSource,
      notifications as never,
    );
    const repo = (entity: never) => dataSource.getRepository(entity);
    const entities = dataSource.entityMetadatas.map((m) => m.target);
    const byName = (name: string) =>
      repo(entities.find((t) => (t as { name?: string }).name === name) as never);
    trash = new TrashService(
      byName('Task') as never,
      byName('Project') as never,
      byName('Reminder') as never,
      byName('ReminderList') as never,
      byName('CalendarEvent') as never,
      byName('Goal') as never,
      byName('LearningTopic') as never,
      byName('LearningSubtopic') as never,
      byName('LearningItem') as never,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  describe('topics', () => {
    it('persists a drag: the new order survives and is what list_learning returns', async () => {
      const a = await newTopic(alice, 'A');
      const b = await newTopic(alice, 'B');
      const c = await newTopic(alice, 'C');
      expect(await topicIds(alice)).toEqual([a, b, c]);

      await service.reorderTopics(alice, { orderedIds: [c, a, b] });

      expect(await topicIds(alice)).toEqual([c, a, b]);
      expect(await positions('learning_topic', 'owner_id = $1', [alice])).toEqual([
        [c, 0],
        [a, 1],
        [b, 2],
      ]);
    });

    it('with a year, only that year is reordered and the other years keep their slots', async () => {
      const owner = (
        await dataSource.query(
          `INSERT INTO app_user (email, password_hash) VALUES ('carol@example.com', 'x') RETURNING id`,
        )
      )[0].id as string;
      const a24 = await newTopic(owner, 'a24', 2024);
      const b25 = await newTopic(owner, 'b25', 2025);
      const c24 = await newTopic(owner, 'c24', 2024);
      const d25 = await newTopic(owner, 'd25', 2025);

      await service.reorderTopics(owner, { year: 2024, orderedIds: [c24, a24] });

      expect(await topicIds(owner)).toEqual([c24, b25, a24, d25]);
    });

    it('rejects a missing, extra or duplicate id with 400 and leaves the DB untouched', async () => {
      const owner = (
        await dataSource.query(
          `INSERT INTO app_user (email, password_hash) VALUES ('dave@example.com', 'x') RETURNING id`,
        )
      )[0].id as string;
      const a = await newTopic(owner, 'A');
      const b = await newTopic(owner, 'B');
      const before = await positions('learning_topic', 'owner_id = $1', [owner]);

      await bad(service.reorderTopics(owner, { orderedIds: [b] }));
      await bad(service.reorderTopics(owner, { orderedIds: [b, a, '999999'] }));
      await bad(service.reorderTopics(owner, { orderedIds: [b, b] }));

      expect(await positions('learning_topic', 'owner_id = $1', [owner])).toEqual(before);
    });

    it("cannot order another user's topics: a foreign id is rejected and nothing changes", async () => {
      const mine = await newTopic(alice, 'mine');
      const theirs = await newTopic(bob, 'theirs');
      const aliceBefore = await positions('learning_topic', 'owner_id = $1', [alice]);
      const bobBefore = await positions('learning_topic', 'owner_id = $1', [bob]);
      const aliceIds = await topicIds(alice);

      await bad(service.reorderTopics(alice, { orderedIds: [...aliceIds.reverse(), theirs] }));
      await bad(service.reorderTopics(alice, { orderedIds: [theirs] }));

      expect(await positions('learning_topic', 'owner_id = $1', [alice])).toEqual(aliceBefore);
      expect(await positions('learning_topic', 'owner_id = $1', [bob])).toEqual(bobBefore);
      expect(mine).toBeDefined();
    });
  });

  describe('subtopics and items', () => {
    let topic: string;
    let s1: string;
    let s2: string;
    let i1: string;
    let i2: string;
    let i3: string;
    let direct: string;

    beforeAll(async () => {
      topic = await newTopic(alice, 'Rust');
      s1 = (await service.createSubtopic(alice, topic, { title: 'Ownership' })).id;
      s2 = (await service.createSubtopic(alice, topic, { title: 'Lifetimes' })).id;
      i1 = (await service.createItem(alice, topic, { text: 'i1', subtopicId: s1 })).id;
      i2 = (await service.createItem(alice, topic, { text: 'i2', subtopicId: s1 })).id;
      i3 = (await service.createItem(alice, topic, { text: 'i3', subtopicId: s2 })).id;
      direct = (await service.createItem(alice, topic, { text: 'direct' })).id;
    });

    it('numbers new rows at the end of their own list, not the whole topic', async () => {
      expect(await positions('learning_item', 'subtopic_id = $1', [s1])).toEqual([
        [i1, 0],
        [i2, 1],
      ]);
      expect(await positions('learning_item', 'subtopic_id = $1', [s2])).toEqual([[i3, 0]]);
      expect(
        await positions('learning_item', 'topic_id = $1 AND subtopic_id IS NULL', [topic]),
      ).toEqual([[direct, 0]]);
    });

    it('reorders subtopics, the items of a subtopic and the direct items', async () => {
      await service.reorderSubtopics(alice, topic, { orderedIds: [s2, s1] });
      await service.reorderSubtopicItems(alice, s1, { orderedIds: [i2, i1] });

      const [t] = await service.listTopics(alice).then((all) => all.filter((x) => x.id === topic));
      expect(t.subtopics.map((s) => s.id)).toEqual([s2, s1]);
      expect(t.subtopics[1].items.map((i) => i.id)).toEqual([i2, i1]);
    });

    it('rejects a direct-item reorder that includes an item of a subtopic', async () => {
      await bad(service.reorderItems(alice, topic, { orderedIds: [direct, i1] }));
      await service.reorderItems(alice, topic, { orderedIds: [direct] });
    });

    it('moves an item to another subtopic: subtopic_id and both lists change together', async () => {
      await service.moveItem(alice, i2, { subtopicId: s2, index: 0 });

      expect(await positions('learning_item', 'subtopic_id = $1', [s2])).toEqual([
        [i2, 0],
        [i3, 1],
      ]);
      expect(await positions('learning_item', 'subtopic_id = $1', [s1])).toEqual([[i1, 0]]);
    });

    it('moves an item out to the topic list and back', async () => {
      await service.moveItem(alice, i3, { subtopicId: null, index: 0 });
      expect(
        await positions('learning_item', 'topic_id = $1 AND subtopic_id IS NULL', [topic]),
      ).toEqual([
        [i3, 0],
        [direct, 1],
      ]);

      await service.moveItem(alice, i3, { subtopicId: s1, index: 99 });
      expect(await positions('learning_item', 'subtopic_id = $1', [s1])).toEqual([
        [i1, 0],
        [i3, 1],
      ]);
    });

    it("cannot touch another user's topic, subtopic or item", async () => {
      await bad(service.reorderSubtopics(bob, topic, { orderedIds: [s1, s2] }));
      await bad(service.reorderSubtopicItems(bob, s1, { orderedIds: [i1] }));
      await bad(service.moveItem(bob, i1, { subtopicId: null, index: 0 }));
      await bad(service.deleteTopic(bob, topic));
      await bad(service.restoreTopic(bob, topic));
    });

    it('rejects moving an item into a subtopic of a different topic', async () => {
      const other = await newTopic(alice, 'Other');
      const foreignSub = (await service.createSubtopic(alice, other, { title: 'x' })).id;

      await bad(service.moveItem(alice, i1, { subtopicId: foreignSub, index: 0 }));
    });
  });

  describe('delete, restore, undo and trash', () => {
    const ctx = (): UndoContext => ({
      manager: dataSource.manager,
      ownerId: alice,
      latestAfterMs: new Map(),
      initialUpdatedMs: new Map(),
    });
    const entry = (
      type: ChangeEntry['targetType'],
      id: string,
      op: ChangeEntry['op'],
      before = {},
    ) => ({ targetType: type, targetId: id, op, before, after: null }) as unknown as ChangeEntry;

    it('deleting a topic hides it and its children, and trash lists only the topic', async () => {
      const t = await newTopic(alice, 'Doomed');
      const s = (await service.createSubtopic(alice, t, { title: 'sub' })).id;
      await service.createItem(alice, t, { text: 'inside', subtopicId: s });

      await service.deleteTopic(alice, t);

      expect(await topicIds(alice)).not.toContain(t);
      const page = await trash.list(alice, {
        kinds: ['learning_topic', 'learning_subtopic', 'learning_item'],
      });
      expect(page.items.map((e) => [e.kind, e.id])).toContainEqual(['learning_topic', t]);
      expect(page.items.find((e) => e.kind === 'learning_subtopic' && e.id === s)).toBeUndefined();
      expect(page.items.find((e) => e.title === 'inside')).toBeUndefined();
      // Bob never sees Alice's trash.
      const bobs = await trash.list(bob, { kinds: ['learning_topic'] });
      expect(bobs.items.find((e) => e.id === t)).toBeUndefined();
    });

    it('restore brings the topic back at the end with its children', async () => {
      const t = await newTopic(alice, 'Phoenix');
      const s = (await service.createSubtopic(alice, t, { title: 'sub' })).id;
      const item = (await service.createItem(alice, t, { text: 'inside', subtopicId: s })).id;
      await service.deleteTopic(alice, t);
      await newTopic(alice, 'Newer');

      await service.restoreTopic(alice, t);

      const ids = await topicIds(alice);
      expect(ids[ids.length - 1]).toBe(t);
      const [restored] = (await service.listTopics(alice)).filter((x) => x.id === t);
      expect(restored.subtopics[0].items[0].id).toBe(item);
    });

    it('a subtopic deleted on its own is listed and restorable, an item of a deleted subtopic is not listed alone', async () => {
      const t = await newTopic(alice, 'Parent');
      const s = (await service.createSubtopic(alice, t, { title: 'gone' })).id;
      const item = (await service.createItem(alice, t, { text: 'child', subtopicId: s })).id;
      const lone = (await service.createItem(alice, t, { text: 'lone' })).id;

      await service.deleteSubtopic(alice, s);
      await service.deleteItem(alice, lone);

      const page = await trash.list(alice, {
        kinds: ['learning_subtopic', 'learning_item'],
        limit: 100,
      });
      const listed = page.items.map((e) => `${e.kind}:${e.id}`);
      expect(listed).toContain(`learning_subtopic:${s}`);
      expect(listed).toContain(`learning_item:${lone}`);
      expect(listed).not.toContain(`learning_item:${item}`);

      await expect(service.restoreItem(alice, item)).rejects.toBeInstanceOf(ApiException);
      await service.restoreSubtopic(alice, s);
      const [back] = (await service.listTopics(alice)).filter((x) => x.id === t);
      expect(back.subtopics[0].items.map((i) => i.id)).toEqual([item]);
    });

    it('undo of a reorder writes the old positions back', async () => {
      const t = await newTopic(alice, 'Undoable');
      const a = (await service.createSubtopic(alice, t, { title: 'a' })).id;
      const b = (await service.createSubtopic(alice, t, { title: 'b' })).id;
      await service.reorderSubtopics(alice, t, { orderedIds: [b, a] });

      expect(
        await applyLearningUndo(ctx(), entry('learning_subtopic', a, 'update', { position: 0 })),
      ).toBeNull();
      expect(
        await applyLearningUndo(ctx(), entry('learning_subtopic', b, 'update', { position: 1 })),
      ).toBeNull();

      const [reverted] = (await service.listTopics(alice)).filter((x) => x.id === t);
      expect(reverted.subtopics.map((s) => s.id)).toEqual([a, b]);
    });

    it('undo of a delete restores the topic and its children; a foreign owner gets not_owner', async () => {
      const t = await newTopic(alice, 'UndoDelete');
      const s = (await service.createSubtopic(alice, t, { title: 'sub' })).id;
      await service.createItem(alice, t, { text: 'inside', subtopicId: s });
      await service.deleteTopic(alice, t);

      expect(
        await applyLearningUndo({ ...ctx(), ownerId: bob }, entry('learning_topic', t, 'delete')),
      ).toBe('not_owner');
      expect(await applyLearningUndo(ctx(), entry('learning_topic', t, 'delete'))).toBeNull();

      const [back] = (await service.listTopics(alice)).filter((x) => x.id === t);
      expect(back.subtopics[0].items).toHaveLength(1);
    });
  });

  describe('change_entry target types', () => {
    it('the widened CHECK constraint accepts learning targets and still rejects unknown ones', async () => {
      const [cs] = await dataSource.query(
        `INSERT INTO change_set (owner_id, source, label) VALUES ($1, 'mcp', 'x') RETURNING id`,
        [alice],
      );
      const insert = (type: string) =>
        dataSource.query(
          `INSERT INTO change_entry (change_set_id, owner_id, ordinal, target_type, target_id, op)
           VALUES ($1, $2, 1, $3, 1, 'update')`,
          [cs.id, alice, type],
        );

      for (const type of ['learning_topic', 'learning_subtopic', 'learning_item', 'item'])
        await insert(type);
      await expect(insert('learning_bogus')).rejects.toThrow(/ck_change_entry_target_type/);
    });
  });
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLearningTools } from './learning-tools';

/** Parses the JSON the tool returned as text content. */
const payload = (result: any) => JSON.parse(result.content[0].text);

describe('learning-tools ordering, rename and delete', () => {
  let server: McpServer;
  let learningService: Record<string, jest.Mock>;
  let changeSetService: { runWithChangeSet: jest.Mock; recordEntry: jest.Mock };
  let recorded: any[];

  const write = { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } };
  const readOnly = { authInfo: { scopes: ['learning:read'], extra: { ownerId: 'u1' } } };
  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  const item = (id: string, position: number, subtopicId: string | null = null) => ({
    id,
    position,
    subtopicId,
    text: `item ${id}`,
  });
  const topic = (id: string, position: number, over: Record<string, unknown> = {}) => ({
    id,
    position,
    title: `topic ${id}`,
    description: null,
    updatedAt: '2026-05-01T00:00:00.000Z',
    items: [],
    subtopics: [],
    ...over,
  });

  beforeEach(() => {
    recorded = [];
    server = new McpServer({ name: 'test', version: '1.0.0' });
    learningService = {};
    for (const m of [
      'listTopics',
      'getTopic',
      'getSubtopic',
      'getItem',
      'reorderTopics',
      'reorderSubtopics',
      'reorderItems',
      'reorderSubtopicItems',
      'moveItem',
      'updateSubtopic',
      'deleteTopic',
      'deleteSubtopic',
      'deleteItem',
      'restoreTopic',
      'restoreSubtopic',
      'restoreItem',
    ])
      learningService[m] = jest.fn();
    changeSetService = {
      runWithChangeSet: jest.fn(async (_owner, _meta, fn) => ({
        result: await fn('cs1', {}),
        changeSetId: 'cs1',
      })),
      recordEntry: jest.fn(async (_cs, _owner, entry) => {
        recorded.push(entry);
      }),
    };
    registerLearningTools(server, {
      learningService: learningService as never,
      changeSetService,
    } as never);
  });

  describe('reorder_learning_topics', () => {
    it('calls the service, runs in an mcp change set and records one update per moved topic', async () => {
      learningService.listTopics
        .mockResolvedValueOnce([topic('a', 0), topic('b', 1), topic('c', 2)])
        .mockResolvedValueOnce([
          topic('c', 0, { updatedAt: '2026-05-02T00:00:00.000Z' }),
          topic('a', 1, { updatedAt: '2026-05-02T00:00:00.000Z' }),
          topic('b', 2, { updatedAt: '2026-05-02T00:00:00.000Z' }),
        ]);

      const result = await getHandler('reorder_learning_topics')(
        { year: 2026, orderedIds: ['c', 'a', 'b'] },
        write,
      );

      expect(learningService.reorderTopics).toHaveBeenCalledWith('u1', {
        year: 2026,
        orderedIds: ['c', 'a', 'b'],
      });
      expect(changeSetService.runWithChangeSet).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ source: 'mcp' }),
        expect.any(Function),
      );
      expect(recorded).toHaveLength(3);
      expect(recorded).toContainEqual({
        targetType: 'learning_topic',
        targetId: 'c',
        op: 'update',
        before: { position: 2 },
        after: { position: 0, updatedAt: '2026-05-02T00:00:00.000Z' },
      });
      expect(payload(result)).toMatchObject({ changeSetId: 'cs1' });
    });

    it('records nothing for a reorder that changes nothing', async () => {
      learningService.listTopics.mockResolvedValue([topic('a', 0), topic('b', 1)]);

      await getHandler('reorder_learning_topics')({ orderedIds: ['a', 'b'] }, write);

      expect(recorded).toHaveLength(0);
    });

    it('needs the learning:write scope', async () => {
      await expect(
        getHandler('reorder_learning_topics')({ orderedIds: ['a'] }, readOnly),
      ).rejects.toThrow();
      expect(learningService.reorderTopics).not.toHaveBeenCalled();
    });

    it('lets service validation errors through and records no entries', async () => {
      learningService.listTopics.mockResolvedValue([topic('a', 0)]);
      learningService.reorderTopics.mockRejectedValue(new Error('orderedIds must contain exactly'));

      await expect(
        getHandler('reorder_learning_topics')({ orderedIds: ['a', 'zzz'] }, write),
      ).rejects.toThrow('orderedIds must contain exactly');
      expect(recorded).toHaveLength(0);
    });
  });

  describe('reorder_learning_subtopics', () => {
    it('reorders the subtopics of a topic and records their position changes', async () => {
      const sub = (id: string, position: number) => ({
        id,
        position,
        title: id,
        description: null,
        updatedAt: 'T0',
        items: [],
      });
      learningService.listTopics
        .mockResolvedValueOnce([topic('t1', 0, { subtopics: [sub('s1', 0), sub('s2', 1)] })])
        .mockResolvedValueOnce([topic('t1', 0, { subtopics: [sub('s2', 0), sub('s1', 1)] })]);

      await getHandler('reorder_learning_subtopics')(
        { topicId: 't1', orderedIds: ['s2', 's1'] },
        write,
      );

      expect(learningService.reorderSubtopics).toHaveBeenCalledWith('u1', 't1', {
        orderedIds: ['s2', 's1'],
      });
      expect(recorded.map((e) => [e.targetType, e.targetId])).toEqual([
        ['learning_subtopic', 's1'],
        ['learning_subtopic', 's2'],
      ]);
    });
  });

  describe('reorder_learning_items', () => {
    it('reorders the direct items when topicId is given', async () => {
      learningService.listTopics.mockResolvedValue([topic('t1', 0)]);

      await getHandler('reorder_learning_items')(
        { topicId: 't1', orderedIds: ['i2', 'i1'] },
        write,
      );

      expect(learningService.reorderItems).toHaveBeenCalledWith('u1', 't1', {
        orderedIds: ['i2', 'i1'],
      });
    });

    it('reorders the items of a subtopic when subtopicId is given', async () => {
      learningService.listTopics.mockResolvedValue([topic('t1', 0)]);

      await getHandler('reorder_learning_items')(
        { subtopicId: 's1', orderedIds: ['i2', 'i1'] },
        write,
      );

      expect(learningService.reorderSubtopicItems).toHaveBeenCalledWith('u1', 's1', {
        orderedIds: ['i2', 'i1'],
      });
    });

    it.each([
      ['neither id', {}],
      ['both ids', { topicId: 't1', subtopicId: 's1' }],
    ])('rejects %s', async (_name, ids) => {
      await expect(
        getHandler('reorder_learning_items')({ ...ids, orderedIds: ['i1'] }, write),
      ).rejects.toThrow(/exactly one/i);
      expect(learningService.reorderItems).not.toHaveBeenCalled();
      expect(learningService.reorderSubtopicItems).not.toHaveBeenCalled();
    });

    it('records the position changes of the reordered items', async () => {
      const t = (a: number, b: number) => topic('t1', 0, { items: [item('i1', a), item('i2', b)] });
      learningService.listTopics.mockResolvedValueOnce([t(0, 1)]).mockResolvedValueOnce([t(1, 0)]);

      await getHandler('reorder_learning_items')(
        { topicId: 't1', orderedIds: ['i2', 'i1'] },
        write,
      );

      expect(recorded).toEqual([
        {
          targetType: 'learning_item',
          targetId: 'i1',
          op: 'update',
          before: { position: 0 },
          after: { position: 1 },
        },
        {
          targetType: 'learning_item',
          targetId: 'i2',
          op: 'update',
          before: { position: 1 },
          after: { position: 0 },
        },
      ]);
    });
  });

  describe('item conflict detection', () => {
    it('records the item updatedAt so an undo can tell later edits apart', async () => {
      const it = (position: number, updatedAt: string) => ({
        ...item('i1', position),
        updatedAt,
      });
      learningService.listTopics
        .mockResolvedValueOnce([
          topic('t1', 0, { items: [it(0, 'T0'), { ...it(1, 'T0'), id: 'i2' }] }),
        ])
        .mockResolvedValueOnce([
          topic('t1', 0, {
            items: [
              { ...it(1, 'T9'), id: 'i2' },
              { ...it(0, 'T9'), position: 1 },
            ],
          }),
        ]);
      learningService.listTopics.mockResolvedValueOnce([]);

      await getHandler('reorder_learning_items')(
        { topicId: 't1', orderedIds: ['i2', 'i1'] },
        write,
      );

      expect(recorded.length).toBeGreaterThan(0);
      for (const entry of recorded) expect(entry.after.updatedAt).toBe('T9');
    });
  });

  describe('move_learning_item', () => {
    it('moves the item and records its previous subtopic and position', async () => {
      const before = [
        topic('t1', 0, {
          subtopics: [
            {
              id: 's1',
              position: 0,
              title: 's1',
              description: null,
              updatedAt: 'T0',
              items: [item('i1', 0, 's1')],
            },
            { id: 's2', position: 1, title: 's2', description: null, updatedAt: 'T0', items: [] },
          ],
        }),
      ];
      const after = [
        topic('t1', 0, {
          subtopics: [
            { id: 's1', position: 0, title: 's1', description: null, updatedAt: 'T0', items: [] },
            {
              id: 's2',
              position: 1,
              title: 's2',
              description: null,
              updatedAt: 'T0',
              items: [item('i1', 0, 's2')],
            },
          ],
        }),
      ];
      learningService.listTopics.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

      const result = await getHandler('move_learning_item')(
        { itemId: 'i1', subtopicId: 's2', index: 0 },
        write,
      );

      expect(learningService.moveItem).toHaveBeenCalledWith('u1', 'i1', {
        subtopicId: 's2',
        index: 0,
      });
      expect(recorded).toEqual([
        {
          targetType: 'learning_item',
          targetId: 'i1',
          op: 'update',
          before: { subtopicId: 's1' },
          after: { subtopicId: 's2' },
        },
      ]);
      expect(payload(result).changeSetId).toBe('cs1');
    });

    it('accepts null to move an item to the direct list of its topic', async () => {
      learningService.listTopics.mockResolvedValue([topic('t1', 0)]);

      await getHandler('move_learning_item')({ itemId: 'i1', subtopicId: null, index: 2 }, write);

      expect(learningService.moveItem).toHaveBeenCalledWith('u1', 'i1', {
        subtopicId: null,
        index: 2,
      });
    });
  });

  describe('update_learning_subtopic', () => {
    it('merges omitted fields with the current subtopic and records before/after', async () => {
      const current = {
        id: 's1',
        topicId: 't1',
        title: 'Old',
        description: 'Keep',
        updatedAt: 'T0',
      };
      learningService.getSubtopic.mockResolvedValue(current);
      learningService.updateSubtopic.mockResolvedValue({
        ...current,
        title: 'New',
        updatedAt: 'T1',
      });

      await getHandler('update_learning_subtopic')({ id: 's1', title: 'New' }, write);

      expect(learningService.updateSubtopic).toHaveBeenCalledWith('u1', 's1', {
        title: 'New',
        description: 'Keep',
      });
      expect(recorded).toEqual([
        {
          targetType: 'learning_subtopic',
          targetId: 's1',
          op: 'update',
          before: { title: 'Old', description: 'Keep' },
          after: { title: 'New', description: 'Keep', updatedAt: 'T1' },
        },
      ]);
    });

    it('can clear the description with null', async () => {
      learningService.getSubtopic.mockResolvedValue({
        id: 's1',
        title: 'Old',
        description: 'x',
        updatedAt: 'T0',
      });
      learningService.updateSubtopic.mockResolvedValue({
        id: 's1',
        title: 'Old',
        description: null,
        updatedAt: 'T1',
      });

      await getHandler('update_learning_subtopic')({ id: 's1', description: null }, write);

      expect(learningService.updateSubtopic).toHaveBeenCalledWith('u1', 's1', {
        title: 'Old',
        description: null,
      });
    });

    it('needs the learning:write scope', async () => {
      await expect(
        getHandler('update_learning_subtopic')({ id: 's1', title: 'x' }, readOnly),
      ).rejects.toThrow();
    });
  });

  describe.each([
    ['delete_learning_topic', 'getTopic', 'deleteTopic', 'learning_topic'],
    ['delete_learning_subtopic', 'getSubtopic', 'deleteSubtopic', 'learning_subtopic'],
    ['delete_learning_item', 'getItem', 'deleteItem', 'learning_item'],
  ])('%s', (tool, getter, deleter, targetType) => {
    it('soft-deletes through the service and records an undoable delete entry', async () => {
      learningService[getter].mockResolvedValue({ id: '9', title: 'Rust', text: 'Rust' });

      const result = await getHandler(tool)({ id: '9' }, write);

      expect(learningService[deleter]).toHaveBeenCalledWith('u1', '9');
      expect(recorded).toEqual([
        expect.objectContaining({ targetType, targetId: '9', op: 'delete' }),
      ]);
      expect(payload(result)).toMatchObject({ success: true, changeSetId: 'cs1' });
    });

    it('does not delete a missing or foreign target (the lookup throws first)', async () => {
      learningService[getter].mockRejectedValue(new Error('not found'));

      await expect(getHandler(tool)({ id: '9' }, write)).rejects.toThrow('not found');
      expect(learningService[deleter]).not.toHaveBeenCalled();
      expect(recorded).toHaveLength(0);
    });

    it('needs the learning:write scope', async () => {
      await expect(getHandler(tool)({ id: '9' }, readOnly)).rejects.toThrow();
      expect(learningService[deleter]).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['restore_learning_topic', 'restoreTopic'],
    ['restore_learning_subtopic', 'restoreSubtopic'],
    ['restore_learning_item', 'restoreItem'],
  ])('%s', (tool, restorer) => {
    it('restores through the service without opening a change set', async () => {
      learningService[restorer].mockResolvedValue({ id: '9' });

      const result = await getHandler(tool)({ id: '9' }, write);

      expect(learningService[restorer]).toHaveBeenCalledWith('u1', '9');
      expect(changeSetService.runWithChangeSet).not.toHaveBeenCalled();
      expect(payload(result)).toMatchObject({ id: '9' });
    });

    it('needs the learning:write scope', async () => {
      await expect(getHandler(tool)({ id: '9' }, readOnly)).rejects.toThrow();
    });
  });
});

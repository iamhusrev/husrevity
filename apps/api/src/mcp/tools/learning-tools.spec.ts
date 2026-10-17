import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLearningTools } from './learning-tools';

describe('learning-tools', () => {
  let server: McpServer;
  let learningService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    learningService = {
      listTopics: jest.fn(),
      createTopic: jest.fn(),
      updateTopic: jest.fn(),
      createSubtopic: jest.fn(),
      createItem: jest.fn(),
      updateItem: jest.fn(),
      toggleItem: jest.fn(),
    };
    registerLearningTools(server, { learningService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  it('list_learning throws without auth', async () => {
    await expect(getHandler('list_learning')({})).rejects.toThrow('Unauthorized');
  });

  it('list_learning calls service when valid', async () => {
    learningService.listTopics.mockResolvedValueOnce([]);
    await getHandler('list_learning')({ authInfo: { scopes: ['learning:read'], extra: { ownerId: 'u1' } } });
    expect(learningService.listTopics).toHaveBeenCalledWith('u1');
  });

  it('update_learning_topic merges with existing topic', async () => {
    learningService.listTopics.mockResolvedValueOnce([{ id: 't1', title: 'A', description: 'B' }]);
    learningService.updateTopic.mockResolvedValueOnce({ id: 't1', title: 'newA', description: 'B' });
    await getHandler('update_learning_topic')(
      { id: 't1', title: 'newA' },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    expect(learningService.updateTopic).toHaveBeenCalledWith('u1', 't1', { title: 'newA', description: 'B' });
  });

  it('create_learning_topic passes year through to the service', async () => {
    learningService.createTopic.mockResolvedValueOnce({ id: 't1', title: 'A', year: 2025 });
    await getHandler('create_learning_topic')(
      { title: 'A', year: 2025 },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    expect(learningService.createTopic).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'A', year: 2025 }),
    );
  });

  it('create_learning_topic leaves year undefined when omitted', async () => {
    learningService.createTopic.mockResolvedValueOnce({ id: 't1', title: 'A', year: 2026 });
    await getHandler('create_learning_topic')(
      { title: 'A' },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    const [, req] = learningService.createTopic.mock.calls[0];
    expect(req.year).toBeUndefined();
  });

  // The listed year is always resolved (column ?? created year). Sending it back would pin a
  // derived year into the column on an unrelated title edit, so an omitted year is not sent at all.
  it('update_learning_topic does not send a year when the call omits it', async () => {
    learningService.listTopics.mockResolvedValueOnce([
      { id: 't1', title: 'A', description: 'B', year: 2024 },
    ]);
    learningService.updateTopic.mockResolvedValueOnce({ id: 't1', title: 'newA', year: 2024 });
    await getHandler('update_learning_topic')(
      { id: 't1', title: 'newA' },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    const req = learningService.updateTopic.mock.calls[0][2];
    expect(req).toEqual({ title: 'newA', description: 'B' });
    expect('year' in req).toBe(false);
  });

  it('update_learning_topic clears the year back to derived when the call gives null', async () => {
    learningService.listTopics.mockResolvedValueOnce([
      { id: 't1', title: 'A', description: 'B', year: 2024 },
    ]);
    learningService.updateTopic.mockResolvedValueOnce({ id: 't1', title: 'A', year: 2026 });
    await getHandler('update_learning_topic')(
      { id: 't1', year: null },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    expect(learningService.updateTopic).toHaveBeenCalledWith('u1', 't1', {
      title: 'A',
      description: 'B',
      year: null,
    });
  });

  it('update_learning_topic input schema accepts null and rejects out-of-range years', () => {
    const schema = (server as any)._registeredTools['update_learning_topic'].inputSchema;
    expect(schema.safeParse({ id: 't1', year: null }).success).toBe(true);
    expect(schema.safeParse({ id: 't1', year: 2025 }).success).toBe(true);
    expect(schema.safeParse({ id: 't1', year: 1999 }).success).toBe(false);
    expect(schema.safeParse({ id: 't1', year: 2025.5 }).success).toBe(false);
  });

  it('update_learning_topic overrides the year when the call gives one', async () => {
    learningService.listTopics.mockResolvedValueOnce([
      { id: 't1', title: 'A', description: 'B', year: 2024 },
    ]);
    learningService.updateTopic.mockResolvedValueOnce({ id: 't1', title: 'A', year: 2023 });
    await getHandler('update_learning_topic')(
      { id: 't1', year: 2023 },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    expect(learningService.updateTopic).toHaveBeenCalledWith('u1', 't1', {
      title: 'A',
      description: 'B',
      year: 2023,
    });
  });

  it('update_learning_item merges with existing item', async () => {
    learningService.listTopics.mockResolvedValueOnce([{
      id: 't1',
      items: [{ id: 'i1', text: 'T' }],
      subtopics: []
    }]);
    learningService.updateItem.mockResolvedValueOnce({ id: 'i1', text: 'newT' });
    await getHandler('update_learning_item')(
      { id: 'i1', text: 'newT' },
      { authInfo: { scopes: ['learning:write'], extra: { ownerId: 'u1' } } }
    );
    expect(learningService.updateItem).toHaveBeenCalledWith('u1', 'i1', expect.objectContaining({ text: 'newT' }));
  });
});

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

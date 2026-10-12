import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNoteTools } from './note-tools';

describe('note-tools', () => {
  let server: McpServer;
  let noteService: any;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    noteService = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      listTags: jest.fn(),
      createTag: jest.fn(),
    };
    registerNoteTools(server, { noteService });
  });

  const getHandler = (name: string) => (server as any)._registeredTools[name]?.handler;

  describe('create_note', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('create_note')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('create_note')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      noteService.create.mockResolvedValueOnce({ id: 'n1', title: 'T' });
      await getHandler('create_note')(
        { title: 'T' },
        { authInfo: { scopes: ['notes:write'], extra: { ownerId: 'u1' } } }
      );
      expect(noteService.create).toHaveBeenCalledWith('u1', { title: 'T' });
    });
  });

  describe('list_notes', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('list_notes')({}, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('list_notes')({}, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      noteService.list.mockResolvedValueOnce([]);
      await getHandler('list_notes')(
        {},
        { authInfo: { scopes: ['notes:read'], extra: { ownerId: 'u1' } } }
      );
      expect(noteService.list).toHaveBeenCalledWith('u1', undefined, undefined, undefined);
    });
  });

  describe('get_note', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('get_note')({ id: 'n1' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('get_note')({ id: 'n1' }, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      noteService.get.mockResolvedValueOnce({ id: 'n1' });
      await getHandler('get_note')(
        { id: 'n1' },
        { authInfo: { scopes: ['notes:read'], extra: { ownerId: 'u1' } } }
      );
      expect(noteService.get).toHaveBeenCalledWith('u1', 'n1');
    });
  });

  describe('update_note', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('update_note')({ id: 'n1' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('update_note')({ id: 'n1' }, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should preserve omitted fields on update', async () => {
      noteService.get.mockResolvedValueOnce({
        id: 'n1',
        title: 'Old Title',
        bodyMarkdown: 'Old Body',
        pinned: false,
        archived: true,
        tags: [{ id: 'tag1' }],
        colorHex: '#fff',
      });
      noteService.update.mockResolvedValueOnce({ id: 'n1' });
      
      await getHandler('update_note')(
        { id: 'n1', title: 'New Title' },
        { authInfo: { scopes: ['notes:write'], extra: { ownerId: 'u1' } } }
      );

      expect(noteService.update).toHaveBeenCalledWith('u1', 'n1', {
        title: 'New Title',
        bodyMarkdown: 'Old Body',
        pinned: false,
        archived: true,
        tagIds: ['tag1'],
        colorHex: '#fff',
      });
    });
  });

  describe('list_note_tags', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('list_note_tags')({})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('list_note_tags')({ authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      noteService.listTags.mockResolvedValueOnce([]);
      await getHandler('list_note_tags')(
        { authInfo: { scopes: ['notes:read'], extra: { ownerId: 'u1' } } }
      );
      expect(noteService.listTags).toHaveBeenCalledWith('u1');
    });
  });

  describe('create_note_tag', () => {
    it('should throw Unauthorized when auth is missing', async () => {
      await expect(getHandler('create_note_tag')({ name: 'Tag' }, {})).rejects.toThrow('Unauthorized');
    });

    it('should throw Forbidden when scope is missing', async () => {
      await expect(
        getHandler('create_note_tag')({ name: 'Tag' }, { authInfo: { scopes: ['wrong'], extra: { ownerId: 'u1' } } })
      ).rejects.toThrow('Forbidden');
    });

    it('should call service with ownerId when valid', async () => {
      noteService.createTag.mockResolvedValueOnce({ id: 't1' });
      await getHandler('create_note_tag')(
        { name: 'Tag' },
        { authInfo: { scopes: ['notes:write'], extra: { ownerId: 'u1' } } }
      );
      expect(noteService.createTag).toHaveBeenCalledWith('u1', { name: 'Tag', color: undefined });
    });
  });
});

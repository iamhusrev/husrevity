import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { McpSearchService } from './mcp-search.service';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';

describe('McpSearchService', () => {
  let service: McpSearchService;
  let itemRepo: { find: jest.Mock };
  let noteRepo: { find: jest.Mock };

  beforeEach(async () => {
    itemRepo = { find: jest.fn() };
    noteRepo = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpSearchService,
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Note), useValue: noteRepo },
      ],
    }).compile();

    service = module.get<McpSearchService>(McpSearchService);
  });

  it('returns empty array when query is empty or whitespace', async () => {
    const results = await service.search('usr_1', '   ');
    expect(results).toEqual([]);
    expect(itemRepo.find).not.toHaveBeenCalled();
    expect(noteRepo.find).not.toHaveBeenCalled();
  });

  it('searches both items and notes by default when no kinds filter is passed', async () => {
    itemRepo.find.mockResolvedValueOnce([
      {
        id: '1',
        kind: 'task',
        title: 'HGS kontrol',
        notes: null,
        status: 'open',
        scheduledAt: null,
        dueAt: null,
        createdAt: new Date('2026-09-28'),
      },
    ]);
    noteRepo.find.mockResolvedValueOnce([
      {
        id: '10',
        title: 'HGS notları',
        bodyMarkdown: 'detaylar',
        pinned: false,
        archived: false,
        createdAt: new Date('2026-09-28'),
      },
    ]);

    const results = await service.search('usr_1', 'HGS');

    expect(itemRepo.find).toHaveBeenCalledWith({
      where: { ownerId: 'usr_1', title: expect.anything() },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    expect(noteRepo.find).toHaveBeenCalledWith({
      where: { ownerId: 'usr_1', title: expect.anything() },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ type: 'item', id: '1', title: 'HGS kontrol' });
    expect(results[1]).toMatchObject({ type: 'note', id: '10', title: 'HGS notları' });
  });

  it('filters by kinds parameter when provided', async () => {
    noteRepo.find.mockResolvedValueOnce([
      {
        id: '10',
        title: 'Toplantı notu',
        bodyMarkdown: 'not',
        pinned: true,
        archived: false,
        createdAt: new Date('2026-09-28'),
      },
    ]);

    const results = await service.search('usr_1', 'Toplantı', { kinds: ['note'] });

    expect(itemRepo.find).not.toHaveBeenCalled();
    expect(noteRepo.find).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'note', id: '10' });
  });
});

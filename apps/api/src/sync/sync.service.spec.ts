import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';
import { Project } from '../project/project.entity';

type MockRepo = { find: jest.Mock };

describe('SyncService', () => {
  const ownerId = '1';
  const since = new Date('2026-01-01T00:00:00Z');
  let service: SyncService;
  let items: MockRepo;
  let notes: MockRepo;
  let projects: MockRepo;

  beforeEach(async () => {
    items = { find: jest.fn().mockResolvedValue([]) };
    notes = { find: jest.fn().mockResolvedValue([]) };
    projects = { find: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: getRepositoryToken(Item), useValue: items },
        { provide: getRepositoryToken(Note), useValue: notes },
        { provide: getRepositoryToken(Project), useValue: projects },
      ],
    }).compile();
    service = module.get(SyncService);
  });

  describe('itemsDelta', () => {
    it('queries live rows (updatedAt > since, owner-scoped, default soft-delete exclusion) and tombstone rows (withDeleted + deletedAt IS NOT NULL) separately', async () => {
      const liveRow = { id: '1', ownerId, updatedAt: since, deletedAt: null } as Item;
      const tombstoneRow = { id: '2', ownerId, updatedAt: since, deletedAt: new Date() } as Item;
      items.find.mockResolvedValueOnce([liveRow]).mockResolvedValueOnce([tombstoneRow]);

      const result = await service.itemsDelta(ownerId, since);

      expect(items.find).toHaveBeenNthCalledWith(1, {
        where: { ownerId, updatedAt: expect.anything() },
        order: { updatedAt: 'ASC' },
      });
      const secondCall = items.find.mock.calls[1][0];
      expect(secondCall.withDeleted).toBe(true);
      expect(secondCall.where).toEqual(
        expect.objectContaining({ ownerId, deletedAt: expect.anything() }),
      );
      expect(result.live).toEqual([liveRow]);
      expect(result.tombstoneIds).toEqual(['2']);
    });

    it('returns empty arrays when nothing changed', async () => {
      items.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const result = await service.itemsDelta(ownerId, since);
      expect(result).toEqual({ live: [], tombstoneIds: [] });
    });
  });

  describe('syncSince', () => {
    it('queries items/notes/projects in parallel and returns a fresh ISO cursor', async () => {
      const before = Date.now();
      const result = await service.syncSince(ownerId, since);
      const after = Date.now();

      expect(items.find).toHaveBeenCalled();
      expect(notes.find).toHaveBeenCalled();
      expect(projects.find).toHaveBeenCalled();
      const cursorMs = new Date(result.cursor).getTime();
      expect(cursorMs).toBeGreaterThanOrEqual(before);
      expect(cursorMs).toBeLessThanOrEqual(after);
    });

    it('defaults to the epoch (full sync) when since is null', async () => {
      await service.syncSince(ownerId, null);
      const call = items.find.mock.calls[0][0];
      expect(call.where.updatedAt.value.getTime()).toBe(0);
    });
  });
});

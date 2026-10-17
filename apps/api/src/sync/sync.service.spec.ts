import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';
import { Project } from '../project/project.entity';
import { Goal } from '../goal/goal.entity';
import { ItemOccurrence } from '../item/item-occurrence.entity';
import { NoteTag } from '../note/note-tag.entity';

type MockRepo = { find: jest.Mock };

describe('SyncService', () => {
  const ownerId = '1';
  const since = new Date('2026-01-01T00:00:00Z');
  let service: SyncService;
  let items: MockRepo;
  let notes: MockRepo;
  let projects: MockRepo;
  let goals: MockRepo;
  let occurrences: MockRepo;
  let noteTags: MockRepo;

  beforeEach(async () => {
    items = { find: jest.fn().mockResolvedValue([]) };
    notes = { find: jest.fn().mockResolvedValue([]) };
    projects = { find: jest.fn().mockResolvedValue([]) };
    goals = { find: jest.fn().mockResolvedValue([]) };
    occurrences = { find: jest.fn().mockResolvedValue([]) };
    noteTags = { find: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: getRepositoryToken(Item), useValue: items },
        { provide: getRepositoryToken(Note), useValue: notes },
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(Goal), useValue: goals },
        { provide: getRepositoryToken(ItemOccurrence), useValue: occurrences },
        { provide: getRepositoryToken(NoteTag), useValue: noteTags },
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

  describe.each([
    ['goalsDelta', () => goals],
    ['itemOccurrencesDelta', () => occurrences],
    ['noteTagsDelta', () => noteTags],
  ] as const)('%s', (method, repo) => {
    it('is owner-scoped and returns live rows and tombstone ids separately', async () => {
      const live = { id: '10', ownerId, updatedAt: since, deletedAt: null };
      const dead = { id: '11', ownerId, updatedAt: since, deletedAt: new Date() };
      repo().find.mockResolvedValueOnce([live]).mockResolvedValueOnce([dead]);

      const result = await (service as any)[method](ownerId, since);

      expect(repo().find).toHaveBeenNthCalledWith(1, {
        where: { ownerId, updatedAt: expect.anything() },
        order: { updatedAt: 'ASC' },
      });
      const second = repo().find.mock.calls[1][0];
      expect(second.withDeleted).toBe(true);
      expect(second.where).toEqual(
        expect.objectContaining({ ownerId, deletedAt: expect.anything() }),
      );
      expect(result).toEqual({ live: [live], tombstoneIds: ['11'] });
    });
  });

  describe('syncSince', () => {
    it('also queries goals, item occurrences and note tags', async () => {
      const result = await service.syncSince(ownerId, since);

      expect(goals.find).toHaveBeenCalled();
      expect(occurrences.find).toHaveBeenCalled();
      expect(noteTags.find).toHaveBeenCalled();
      expect(result.goals).toEqual({ live: [], tombstoneIds: [] });
      expect(result.itemOccurrences).toEqual({ live: [], tombstoneIds: [] });
      expect(result.noteTags).toEqual({ live: [], tombstoneIds: [] });
    });

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

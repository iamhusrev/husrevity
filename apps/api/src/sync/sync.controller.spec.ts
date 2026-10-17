import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AuthenticatedUser } from '../common/current-user.decorator';

const user = { userId: '7' } as AuthenticatedUser;
const empty = { live: [], tombstoneIds: [] };

describe('SyncController', () => {
  let sync: { syncSince: jest.Mock };
  let controller: SyncController;

  beforeEach(() => {
    sync = {
      syncSince: jest.fn().mockResolvedValue({
        items: empty,
        notes: empty,
        projects: empty,
        goals: empty,
        itemOccurrences: empty,
        noteTags: empty,
        cursor: '2026-02-01T00:00:00.000Z',
      }),
    };
    controller = new SyncController(sync as unknown as SyncService);
  });

  it('returns every synced collection, its tombstones and the cursor', async () => {
    const res = await controller.get(user, {});

    expect(Object.keys(res).sort()).toEqual([
      'cursor',
      'goals',
      'itemOccurrences',
      'items',
      'noteTags',
      'notes',
      'projects',
      'tombstones',
    ]);
    expect(Object.keys(res.tombstones).sort()).toEqual([
      'goals',
      'itemOccurrences',
      'items',
      'noteTags',
      'notes',
      'projects',
    ]);
    expect(res.cursor).toBe('2026-02-01T00:00:00.000Z');
  });

  it('passes a null cursor for a full sync and a Date for an incremental one', async () => {
    await controller.get(user, {});
    expect(sync.syncSince).toHaveBeenLastCalledWith('7', null);

    await controller.get(user, { since: '2026-01-01T00:00:00.000Z' });
    expect(sync.syncSince).toHaveBeenLastCalledWith('7', new Date('2026-01-01T00:00:00.000Z'));
  });

  it('maps goals without server-computed progress (the client derives it)', async () => {
    sync.syncSince.mockResolvedValueOnce({
      items: empty,
      notes: empty,
      projects: empty,
      itemOccurrences: empty,
      noteTags: empty,
      goals: {
        live: [
          {
            id: '3',
            ownerId: '7',
            title: 'Ship',
            notes: null,
            horizon: 'month',
            periodStart: '2026-02-01',
            periodEnd: '2026-02-28',
            parentGoalId: null,
            status: 'active',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
        tombstoneIds: ['4'],
      },
      cursor: 'c',
    });

    const res = await controller.get(user, {});

    expect(res.goals).toEqual([
      {
        id: '3',
        title: 'Ship',
        notes: null,
        horizon: 'month',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        parentGoalId: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(res.tombstones.goals).toEqual(['4']);
  });

  it('maps occurrences and note tags to their sync shapes', async () => {
    sync.syncSince.mockResolvedValueOnce({
      items: empty,
      notes: empty,
      projects: empty,
      goals: empty,
      itemOccurrences: {
        live: [
          {
            id: '5',
            itemId: '9',
            ownerId: '7',
            occursOn: '2026-02-03',
            status: 'done',
            completedAt: new Date('2026-02-03T08:00:00Z'),
            updatedAt: new Date('2026-02-03T08:00:01Z'),
          },
        ],
        tombstoneIds: [],
      },
      noteTags: {
        live: [
          {
            id: '6',
            ownerId: '7',
            name: 'idea',
            color: null,
            updatedAt: new Date('2026-02-04T00:00:00Z'),
          },
        ],
        tombstoneIds: [],
      },
      cursor: 'c',
    });

    const res = await controller.get(user, {});

    expect(res.itemOccurrences).toEqual([
      {
        id: '5',
        itemId: '9',
        occursOn: '2026-02-03',
        status: 'done',
        completedAt: '2026-02-03T08:00:00.000Z',
        updatedAt: '2026-02-03T08:00:01.000Z',
      },
    ]);
    expect(res.noteTags).toEqual([
      { id: '6', name: 'idea', color: null, updatedAt: '2026-02-04T00:00:00.000Z' },
    ]);
  });
});

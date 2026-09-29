import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { TodayService } from './today.service';
import { Item } from '../item/item.entity';
import { ItemRecurrenceService } from '../item/item-recurrence.service';

type MockItemRepo = { find: jest.Mock };

describe('TodayService', () => {
  const ownerId = '1';
  let service: TodayService;
  let items: MockItemRepo;
  let recurrence: { expand: jest.Mock };

  beforeEach(async () => {
    items = { find: jest.fn().mockResolvedValue([]) };
    recurrence = { expand: jest.fn().mockReturnValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        TodayService,
        { provide: getRepositoryToken(Item), useValue: items },
        { provide: ItemRecurrenceService, useValue: recurrence },
      ],
    }).compile();
    service = module.get(TodayService);
  });

  describe('dueToday', () => {
    it('queries open task-kind items for the owner by dueAt OR (non-recurring, non-block) scheduledAt', async () => {
      await service.dueToday(ownerId);

      const where = items.find.mock.calls[0][0].where as Array<Record<string, unknown>>;
      expect(where).toHaveLength(2);
      for (const branch of where) {
        expect(branch).toMatchObject({ ownerId, kind: 'task', status: 'open' });
      }
      expect(where[0]).toHaveProperty('dueAt');
      // scheduledAt-only tasks (what quick-add creates) must not drag in recurring / block-linked anchors
      expect(where[1]).toHaveProperty('scheduledAt');
      expect(where[1]).toHaveProperty('rrule');
      expect(where[1]).toHaveProperty('blockId');
    });

    it('falls back to scheduledAt as the displayed time and sorts by the effective time', async () => {
      const early = new Date('2026-01-05T06:00:00Z');
      const late = new Date('2026-01-05T15:00:00Z');
      items.find.mockResolvedValueOnce([
        { id: '2', title: 'Akşam', dueAt: null, scheduledAt: late, status: 'open' } as Item,
        { id: '1', title: 'Sabah', dueAt: early, scheduledAt: null, status: 'open' } as Item,
      ]);

      const result = await service.dueToday(ownerId);

      expect(result.map((r) => r.itemId)).toEqual(['1', '2']);
      expect(result[1].dueAt).toBe(late.toISOString());
    });

    it('maps rows to ItemSummaryDto shape', async () => {
      const dueAt = new Date('2026-01-05T10:00:00Z');
      items.find.mockResolvedValueOnce([
        { id: '10', title: 'Rapor teslim et', dueAt, status: 'open' } as Item,
      ]);

      const result = await service.dueToday(ownerId);

      expect(result).toEqual([
        { itemId: '10', title: 'Rapor teslim et', dueAt: dueAt.toISOString(), status: 'open' },
      ]);
    });

    it('returns an empty list when there is nothing due', async () => {
      items.find.mockResolvedValueOnce([]);
      const result = await service.dueToday(ownerId);
      expect(result).toEqual([]);
    });
  });

  describe('timeline', () => {
    it('includes a non-recurring event scheduled today, excludes non-event kinds and events outside today', async () => {
      const todayAt10 = DateTime.now().setZone('Europe/Istanbul').set({ hour: 10, minute: 0 }).toUTC().toJSDate();
      const yesterday = DateTime.now().setZone('Europe/Istanbul').minus({ days: 1 }).toUTC().toJSDate();
      items.find.mockResolvedValueOnce([
        { id: '1', title: 'Ekip toplantısı', kind: 'event', rrule: null, blockId: null, scheduledAt: todayAt10, durationMin: 30 } as Item,
        { id: '2', title: 'Dün kalan iş', kind: 'event', rrule: null, blockId: null, scheduledAt: yesterday, durationMin: 30 } as Item,
        { id: '3', title: 'Bugünkü görev', kind: 'task', rrule: null, blockId: null, scheduledAt: todayAt10, durationMin: null } as Item,
      ]);

      const result = await service.timeline(ownerId);

      expect(result).toEqual([
        { itemId: '1', title: 'Ekip toplantısı', kind: 'event', scheduledAt: todayAt10.toISOString(), durationMin: 30 },
      ]);
    });

    it("expands a recurring parent's today occurrence and includes its blockId children at the same occurrence", async () => {
      const parent = { id: '10', title: 'Güne Hazırlık', kind: 'event', rrule: 'FREQ=DAILY', blockId: null, durationMin: 120 } as Item;
      const child = { id: '11', title: 'Kuran ve Cevşen', kind: 'task', rrule: null, blockId: '10', durationMin: null } as Item;
      items.find.mockResolvedValueOnce([parent, child]);
      recurrence.expand.mockReturnValueOnce([
        { occursOn: '2026-01-05', occursAt: new Date('2026-01-05T03:00:00Z') },
      ]);

      const result = await service.timeline(ownerId);

      expect(result).toEqual([
        { itemId: '10', title: 'Güne Hazırlık', kind: 'event', scheduledAt: '2026-01-05T03:00:00.000Z', durationMin: 120, occursOn: '2026-01-05' },
        { itemId: '11', title: 'Kuran ve Cevşen', kind: 'task', scheduledAt: '2026-01-05T03:00:00.000Z', durationMin: null, occursOn: '2026-01-05' },
      ]);
    });

    it('sorts the merged flat + expanded entries by scheduledAt', async () => {
      const todayAt14 = DateTime.now().setZone('Europe/Istanbul').set({ hour: 14, minute: 0 }).toUTC().toJSDate();
      const flatLate = { id: '1', title: 'Öğleden sonra', kind: 'event', rrule: null, blockId: null, scheduledAt: todayAt14, durationMin: 30 } as Item;
      const recurringEarly = { id: '2', title: 'Sabah bloğu', kind: 'event', rrule: 'FREQ=DAILY', blockId: null, durationMin: 60 } as Item;
      items.find.mockResolvedValueOnce([flatLate, recurringEarly]);
      recurrence.expand.mockReturnValueOnce([
        { occursOn: '2026-01-05', occursAt: new Date('2026-01-05T03:00:00Z') },
      ]);

      const result = await service.timeline(ownerId);

      expect(result.map((r) => r.itemId)).toEqual(['2', '1']);
    });
  });

  describe('currentBlock', () => {
    it('returns the timeline entry whose window contains "now"', () => {
      const now = new Date();
      const active = {
        itemId: '1',
        title: 'Şu anki blok',
        kind: 'event',
        scheduledAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
        durationMin: 30,
      };
      const past = {
        itemId: '2',
        title: 'Geçmiş blok',
        kind: 'event',
        scheduledAt: new Date(now.getTime() - 120 * 60_000).toISOString(),
        durationMin: 30,
      };

      const result = service.currentBlock([past, active]);

      expect(result).toEqual({
        itemId: '1',
        title: 'Şu anki blok',
        scheduledAt: active.scheduledAt,
        durationMin: 30,
      });
    });

    it('returns null when nothing is active right now', () => {
      const now = new Date();
      const past = {
        itemId: '1',
        title: 'Geçmiş',
        kind: 'event',
        scheduledAt: new Date(now.getTime() - 120 * 60_000).toISOString(),
        durationMin: 30,
      };
      expect(service.currentBlock([past])).toBeNull();
    });

    it('never treats a zero-duration (durationMin=null) entry as current, even at the exact instant', () => {
      const now = new Date();
      const instant = {
        itemId: '1',
        title: 'Anlık',
        kind: 'event',
        scheduledAt: now.toISOString(),
        durationMin: null,
      };
      expect(service.currentBlock([instant])).toBeNull();
    });
  });
});

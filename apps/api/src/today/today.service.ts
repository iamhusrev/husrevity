import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { Item } from '../item/item.entity';
import { ItemRecurrenceService } from '../item/item-recurrence.service';
import { BlockSummaryDto, ItemSummaryDto, TimelineEntryDto } from './dto/today-dtos';

const ISTANBUL = 'Europe/Istanbul';

@Injectable()
export class TodayService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    private readonly recurrence: ItemRecurrenceService,
  ) {}

  /**
   * Open task-kind items due today (Europe/Istanbul) or overdue, owner-scoped.
   * A task counts by `dueAt`, or — when it only has `scheduledAt`, which is
   * what quick-add / the parser produces — by that. Recurring and
   * block-linked tasks are left out of the `scheduledAt` branch: their
   * scheduledAt is just an anchor (e.g. 2018-01-01), so they would otherwise
   * look overdue forever.
   */
  async dueToday(ownerId: string): Promise<ItemSummaryDto[]> {
    const endOfDay = DateTime.now().setZone(ISTANBUL).endOf('day').toUTC().toJSDate();
    const base = { ownerId, kind: 'task' as const, status: 'open' as const };
    const rows = await this.items.find({
      where: [
        { ...base, dueAt: LessThanOrEqual(endOfDay) },
        { ...base, scheduledAt: LessThanOrEqual(endOfDay), rrule: IsNull(), blockId: IsNull() },
      ],
    });
    const effectiveAt = (r: Item): Date | null => r.dueAt ?? r.scheduledAt ?? null;
    return rows
      .sort((a, b) => (effectiveAt(a)?.getTime() ?? 0) - (effectiveAt(b)?.getTime() ?? 0))
      .map((r) => ({
        itemId: r.id,
        title: r.title,
        dueAt: effectiveAt(r)?.toISOString() ?? null,
        status: r.status,
      }));
  }

  /**
   * Today's event-kind items (Europe/Istanbul day), sorted by time. A
   * recurring event's rrule is expanded to today's occurrence (if any);
   * a blockId-linked item with no rrule of its own (e.g. a routine
   * activity) rides along with its recurring parent's occurrence date,
   * mirroring ItemService.list()'s exact merge pattern.
   */
  async timeline(ownerId: string): Promise<TimelineEntryDto[]> {
    const dayStart = DateTime.now().setZone(ISTANBUL).startOf('day');
    const from = dayStart.toUTC().toJSDate();
    const to = dayStart.endOf('day').toUTC().toJSDate();

    const rows = await this.items.find({ where: { ownerId } });
    const recurringEventIds = new Set(
      rows.filter((i) => i.kind === 'event' && i.rrule).map((i) => i.id),
    );

    const entries: TimelineEntryDto[] = [];

    for (const item of rows) {
      if (item.kind !== 'event' || item.rrule) continue;
      if (item.blockId && recurringEventIds.has(item.blockId)) continue;
      if (!item.scheduledAt) continue;
      if (item.scheduledAt < from || item.scheduledAt > to) continue;
      entries.push({
        itemId: item.id,
        title: item.title,
        kind: item.kind,
        scheduledAt: item.scheduledAt.toISOString(),
        durationMin: item.durationMin,
      });
    }

    for (const parent of rows.filter((i) => i.kind === 'event' && i.rrule)) {
      const occurrences = this.recurrence.expand(parent, from, to);
      const children = rows.filter((r) => r.blockId === parent.id);
      for (const occ of occurrences) {
        entries.push({
          itemId: parent.id,
          title: parent.title,
          kind: parent.kind,
          scheduledAt: occ.occursAt.toISOString(),
          durationMin: parent.durationMin,
          occursOn: occ.occursOn,
        });
        for (const child of children) {
          entries.push({
            itemId: child.id,
            title: child.title,
            kind: child.kind,
            scheduledAt: occ.occursAt.toISOString(),
            durationMin: child.durationMin,
            occursOn: occ.occursOn,
          });
        }
      }
    }

    return entries.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  /**
   * Pure derivation over an already-fetched timeline (no DB access) — the
   * caller fetches timeline() once and passes it in, rather than this
   * method re-querying. The active entry is the one whose
   * [scheduledAt, scheduledAt+durationMin) window contains "now"; an entry
   * with no durationMin is a zero-width instant and can never be "current".
   */
  currentBlock(timeline: TimelineEntryDto[]): BlockSummaryDto | null {
    const now = Date.now();
    const active = timeline.find((e) => {
      const start = new Date(e.scheduledAt).getTime();
      const end = e.durationMin != null ? start + e.durationMin * 60_000 : start;
      return start <= now && now < end;
    });
    if (!active) return null;
    return {
      itemId: active.itemId,
      title: active.title,
      scheduledAt: active.scheduledAt,
      durationMin: active.durationMin,
    };
  }
}

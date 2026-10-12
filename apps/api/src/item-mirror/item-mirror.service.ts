import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Item } from '../item/item.entity';
import { Task } from '../task/task.entity';
import { Reminder } from '../reminder/reminder.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { TimeBlock } from '../time-block/time-block.entity';
import {
  mapCalendarEventToItem,
  mapReminderToItem,
  mapTaskToItem,
  mapTimeBlockToItem,
  MirroredItemAttributes,
} from './legacy-item.mapper';

@Injectable()
export class ItemMirrorService {
  private readonly logger = new Logger(ItemMirrorService.name);

  constructor(
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly config: ConfigService,
  ) {}

  private isEnabled(): boolean {
    const flag = String(this.config.get<string>('ITEM_MIRROR_ENABLED') ?? '')
      .trim()
      .toLowerCase();
    return !['false', '0', 'no', 'off'].includes(flag);
  }

  async upsertFromTask(task: Task): Promise<Item | null> {
    if (!this.isEnabled()) return null;
    return this.safeUpsert(() => mapTaskToItem(task));
  }

  async upsertFromReminder(reminder: Reminder): Promise<Item | null> {
    if (!this.isEnabled()) return null;
    return this.safeUpsert(() => mapReminderToItem(reminder));
  }

  async upsertFromCalendarEvent(event: CalendarEvent): Promise<Item | null> {
    if (!this.isEnabled()) return null;
    return this.safeUpsert(() => mapCalendarEventToItem(event));
  }

  async upsertFromTimeBlock(block: TimeBlock): Promise<Item | null> {
    if (!this.isEnabled()) return null;
    return this.safeUpsert(() => mapTimeBlockToItem(block));
  }

  async softDeleteMirror(
    legacyTable: string,
    legacyId: string,
    ownerId: string,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const existing = await this.items.findOne({
        where: { legacyTable, legacyId, ownerId },
      });
      if (existing) {
        await this.items.softRemove(existing);
      }
    } catch (err) {
      this.logger.error(
        `Failed to soft-delete mirror for ${legacyTable} #${legacyId} (owner: ${ownerId}): ${(err as Error).message}`,
      );
    }
  }

  async restoreMirror(
    legacyTable: string,
    legacyId: string,
    ownerId: string,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const existing = await this.items.findOne({
        where: { legacyTable, legacyId, ownerId },
        withDeleted: true,
      });
      if (existing && existing.deletedAt) {
        existing.deletedAt = null;
        await this.items.save(existing);
      }
    } catch (err) {
      this.logger.error(
        `Failed to restore mirror for ${legacyTable} #${legacyId} (owner: ${ownerId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * `build` runs inside the try block on purpose: a mapper that throws on a
   * malformed legacy entity must not escape, so the service keeps its
   * "never throws" contract on its own instead of relying on callers.
   */
  private async safeUpsert(build: () => MirroredItemAttributes): Promise<Item | null> {
    let attrs: MirroredItemAttributes | undefined;
    try {
      attrs = build();
      const existing = await this.items.findOne({
        where: {
          legacyTable: attrs.legacyTable,
          legacyId: attrs.legacyId,
          ownerId: attrs.ownerId,
        },
        withDeleted: true,
      });

      if (existing) {
        existing.kind = attrs.kind;
        existing.title = attrs.title;
        existing.notes = attrs.notes;
        existing.context = attrs.context;
        existing.projectId = attrs.projectId;
        existing.scheduledAt = attrs.scheduledAt;
        existing.durationMin = attrs.durationMin;
        existing.dueAt = attrs.dueAt;
        existing.notifyMinutesBefore = attrs.notifyMinutesBefore;
        existing.rrule = attrs.rrule;
        existing.status = attrs.status;
        existing.completedAt = attrs.completedAt;
        existing.payload = attrs.payload;
        existing.source = attrs.source;
        existing.deletedAt = null;
        return await this.items.save(existing);
      }

      const item = this.items.create({
        ownerId: attrs.ownerId,
        kind: attrs.kind,
        title: attrs.title,
        notes: attrs.notes,
        context: attrs.context,
        projectId: attrs.projectId,
        scheduledAt: attrs.scheduledAt,
        durationMin: attrs.durationMin,
        dueAt: attrs.dueAt,
        notifyMinutesBefore: attrs.notifyMinutesBefore,
        rrule: attrs.rrule,
        status: attrs.status,
        completedAt: attrs.completedAt,
        payload: attrs.payload,
        source: attrs.source,
        legacyTable: attrs.legacyTable,
        legacyId: attrs.legacyId,
      });
      return await this.items.save(item);
    } catch (err) {
      const target = attrs
        ? `${attrs.legacyTable} #${attrs.legacyId} (owner: ${attrs.ownerId})`
        : 'an entity that could not be mapped';
      this.logger.error(`Failed to mirror ${target}: ${(err as Error).message}`);
      return null;
    }
  }
}

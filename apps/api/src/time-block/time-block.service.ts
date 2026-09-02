import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TimeBlock } from './time-block.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import {
  formatLeadTimeBody,
  leadTimeFireAt,
} from '../notification/notification-scheduling';
import {
  TimeBlockRequestDto,
  TimeBlockResponseDto,
} from './dto/time-block-dtos';

@Injectable()
export class TimeBlockService {
  constructor(
    @InjectRepository(TimeBlock)
    private readonly blocks: Repository<TimeBlock>,
    private readonly notifications: NotificationService,
  ) {}

  async listForDate(ownerId: string, date: string): Promise<TimeBlockResponseDto[]> {
    const day = parseLocalDate(date);
    if (!day) throw ApiException.badRequest('Invalid date');
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);
    return this.listForRange(ownerId, from.toISOString(), to.toISOString());
  }

  async listForRange(
    ownerId: string,
    fromIso: string,
    toIso: string,
  ): Promise<TimeBlockResponseDto[]> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw ApiException.badRequest('Invalid from/to');
    }
    // Block overlaps the range when startAt <= to AND endAt >= from
    const rows = await this.blocks
      .createQueryBuilder('b')
      .where('b.owner_id = :ownerId', { ownerId })
      .andWhere('b.start_at <= :to AND b.end_at >= :from', { from, to })
      .orderBy('b.start_at', 'ASC')
      .getMany();
    return rows.map(TimeBlockResponseDto.from);
  }

  async create(
    ownerId: string,
    req: TimeBlockRequestDto,
  ): Promise<TimeBlockResponseDto> {
    this.assertRange(req.startAt, req.endAt);
    const b = this.blocks.create({
      ownerId,
      title: req.title,
      notes: req.notes ?? null,
      startAt: new Date(req.startAt),
      endAt: new Date(req.endAt),
      category: req.category ?? null,
      colorToken: req.colorToken ?? null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
    });
    const saved = await this.blocks.save(b);
    await this.syncNotification(saved);
    return TimeBlockResponseDto.from(saved);
  }

  async update(
    ownerId: string,
    id: string,
    req: TimeBlockRequestDto,
  ): Promise<TimeBlockResponseDto> {
    const b = await this.requireOwned(ownerId, id);
    this.assertRange(req.startAt, req.endAt);
    b.title = req.title;
    b.notes = req.notes ?? null;
    b.startAt = new Date(req.startAt);
    b.endAt = new Date(req.endAt);
    if (req.category !== undefined) b.category = req.category ?? null;
    if (req.colorToken !== undefined) b.colorToken = req.colorToken ?? null;
    if (req.notifyMinutesBefore !== undefined) {
      b.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    }
    const saved = await this.blocks.save(b);
    await this.syncNotification(saved);
    return TimeBlockResponseDto.from(saved);
  }

  async toggleComplete(
    ownerId: string,
    id: string,
  ): Promise<TimeBlockResponseDto> {
    const b = await this.requireOwned(ownerId, id);
    b.completedAt = b.completedAt ? null : new Date();
    const saved = await this.blocks.save(b);
    await this.syncNotification(saved);
    return TimeBlockResponseDto.from(saved);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const b = await this.requireOwned(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'time_block', b.id);
    await this.blocks.softRemove(b);
  }

  async resyncNotifications(ownerId: string): Promise<number> {
    const rows = await this.blocks.find({
      where: { ownerId, completedAt: IsNull() },
    });
    const future = rows.filter((b) => b.startAt.getTime() > Date.now());
    for (const b of future) await this.syncNotification(b);
    return future.length;
  }

  private async syncNotification(b: TimeBlock): Promise<void> {
    await this.notifications.cancelForSource(b.ownerId, 'time_block', b.id);
    if (b.completedAt) return;
    const fireAt = leadTimeFireAt(b.startAt, b.notifyMinutesBefore);
    if (!fireAt) return;
    if (fireAt.getTime() < Date.now() - 60_000) return;
    await this.notifications.enqueue({
      ownerId: b.ownerId,
      kind: 'time_block',
      sourceId: b.id,
      scheduledAt: fireAt,
      title: b.title,
      body: formatLeadTimeBody(
        b.startAt,
        b.notifyMinutesBefore ?? 0,
        b.notes,
      ),
      deepLink: '/evkat',
    });
  }

  private assertRange(startIso: string, endIso: string): void {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw ApiException.badRequest('Invalid startAt/endAt');
    }
    if (end <= start) {
      throw ApiException.badRequest('endAt must be after startAt');
    }
    // Cap a single block at 24h to prevent runaway entries.
    if (end - start > 24 * 60 * 60_000) {
      throw ApiException.badRequest('A single time block cannot exceed 24 hours');
    }
  }

  private async requireOwned(ownerId: string, id: string): Promise<TimeBlock> {
    const b = await this.blocks.findOne({ where: { id, ownerId } });
    if (!b) throw ApiException.notFound('Time block not found');
    return b;
  }
}

function parseLocalDate(s: string): Date | null {
  // Accept 'YYYY-MM-DD' explicitly; fall back to Date constructor otherwise.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

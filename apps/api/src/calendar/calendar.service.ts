import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalendarEvent } from './calendar-event.entity';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import {
  formatLeadTimeBody,
  leadTimeFireAt,
} from '../notification/notification-scheduling';
import { EventRequestDto, EventResponseDto } from './dto/calendar-dtos';

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEvent) private readonly events: Repository<CalendarEvent>,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    ownerId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<EventResponseDto[]> {
    const qb = this.events.createQueryBuilder('e').where('e.owner_id = :ownerId', { ownerId });
    if (from) qb.andWhere('e.end_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('e.start_at <= :to', { to: new Date(to) });
    qb.orderBy('e.start_at', 'ASC');
    const rows = await qb.getMany();
    return rows.map(EventResponseDto.from);
  }

  async get(ownerId: string, id: string): Promise<EventResponseDto> {
    return EventResponseDto.from(await this.requireOwned(ownerId, id));
  }

  async create(ownerId: string, req: EventRequestDto): Promise<EventResponseDto> {
    const e = this.events.create({
      ownerId,
      title: req.title,
      description: req.description ?? null,
      startAt: new Date(req.startAt),
      endAt: new Date(req.endAt),
      allDay: req.allDay ?? false,
      location: req.location ?? null,
      colorHex: req.colorHex ?? null,
      reminderMinutes: req.reminderMinutes ?? null,
      recurrenceRule: req.recurrenceRule ?? null,
    });
    const saved = await this.events.save(e);
    await this.syncNotification(saved);
    return EventResponseDto.from(saved);
  }

  async update(ownerId: string, id: string, req: EventRequestDto): Promise<EventResponseDto> {
    const e = await this.requireOwned(ownerId, id);
    e.title = req.title;
    if (req.description !== undefined) e.description = req.description ?? null;
    e.startAt = new Date(req.startAt);
    e.endAt = new Date(req.endAt);
    if (req.allDay !== undefined) e.allDay = req.allDay;
    if (req.location !== undefined) e.location = req.location ?? null;
    if (req.colorHex !== undefined) e.colorHex = req.colorHex ?? null;
    if (req.reminderMinutes !== undefined) e.reminderMinutes = req.reminderMinutes ?? null;
    if (req.recurrenceRule !== undefined) e.recurrenceRule = req.recurrenceRule ?? null;
    const saved = await this.events.save(e);
    await this.syncNotification(saved);
    return EventResponseDto.from(saved);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const e = await this.requireOwned(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'calendar_event', e.id);
    await this.events.softRemove(e);
  }

  async restore(ownerId: string, id: string): Promise<EventResponseDto> {
    const e = await this.events.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!e || !e.deletedAt) throw ApiException.notFound('Event not found');
    await this.events.restore({ id, ownerId });
    const restored = await this.requireOwned(ownerId, id);
    await this.syncNotification(restored);
    return EventResponseDto.from(restored);
  }

  /**
   * Calendar events use the existing `reminderMinutes` column (matching the
   * Spring → Nest port; the new lead-time pattern on reminder/task/list_item
   * shadows the same idea under a slightly different name).
   *
   * V1 only schedules a single notification for the next firing time. RRULE
   * expansion (recurring events) is deferred to Faz 5.
   */
  private async syncNotification(e: CalendarEvent): Promise<void> {
    await this.notifications.cancelForSource(e.ownerId, 'calendar_event', e.id);
    const fireAt = leadTimeFireAt(e.startAt, e.reminderMinutes);
    if (!fireAt) return;
    // Don't enqueue for events that already started — the cron would just
    // immediately fire it on the next tick, which is rarely what the user wants.
    if (fireAt.getTime() < Date.now() - 60_000) return;
    await this.notifications.enqueue({
      ownerId: e.ownerId,
      kind: 'calendar_event',
      sourceId: e.id,
      scheduledAt: fireAt,
      title: e.title,
      body: formatLeadTimeBody(
        e.startAt,
        e.reminderMinutes ?? 0,
        e.location ?? e.description,
      ),
      deepLink: '/calendar',
    });
  }

  private async requireOwned(ownerId: string, id: string): Promise<CalendarEvent> {
    const e = await this.events.findOne({ where: { id, ownerId } });
    if (!e) throw ApiException.notFound('Event not found');
    return e;
  }
}

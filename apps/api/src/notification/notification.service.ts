import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { Notification, NotificationKind } from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import {
  EnqueueInput,
  NotificationListQueryDto,
  NotificationResponseDto,
  PushSubscribeDto,
} from './dto/notification-dtos';

/**
 * Central hub for the notification system. Every domain module (Reminder,
 * Task, CalendarEvent, TimeBlock) calls `enqueue` / `cancelForSource`
 * from its create/update/delete service paths. The dispatcher (separate
 * service) is the only consumer that *sends* — everything else is just
 * scheduling rows here.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
    private readonly config: ConfigService,
  ) {}

  // ─── Enqueue / cancel ───────────────────────────────────────────────────────

  /**
   * Idempotent upsert by `(ownerId, kind, sourceId, scheduledAt)`. If a row
   * for that exact trigger already exists and hasn't dispatched, its
   * presentation fields (title/body/deepLink) get refreshed — so an entity
   * edit that doesn't change time still updates copy.
   */
  async enqueue(input: EnqueueInput): Promise<void> {
    const existing = await this.notifications.findOne({
      where: {
        ownerId: input.ownerId,
        kind: input.kind,
        sourceId: input.sourceId,
        scheduledAt: input.scheduledAt,
      },
    });
    if (existing) {
      if (existing.dispatchedAt) return; // already sent — don't resurrect
      existing.title = input.title;
      existing.body = input.body ?? null;
      existing.deepLink = input.deepLink ?? null;
      await this.notifications.save(existing);
      return;
    }
    const row = this.notifications.create({
      ownerId: input.ownerId,
      kind: input.kind,
      sourceId: input.sourceId,
      scheduledAt: input.scheduledAt,
      title: input.title,
      body: input.body ?? null,
      deepLink: input.deepLink ?? null,
      dispatchedAt: null,
      readAt: null,
    });
    await this.notifications.save(row);
  }

  /**
   * Soft-delete every undispatched notification for a source entity. Called
   * when the entity is updated (then re-enqueue with new schedule) or
   * deleted/completed (no re-enqueue).
   */
  async cancelForSource(
    ownerId: string,
    kind: NotificationKind,
    sourceId: string,
  ): Promise<void> {
    const rows = await this.notifications.find({
      where: {
        ownerId,
        kind,
        sourceId,
        dispatchedAt: IsNull(),
      },
    });
    if (rows.length === 0) return;
    await this.notifications.softRemove(rows);
  }

  // ─── Read feed (bell dropdown) ──────────────────────────────────────────────

  async listForOwner(
    ownerId: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationResponseDto[]> {
    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n.owner_id = :ownerId', { ownerId });
    if (query.unread) qb.andWhere('n.read_at IS NULL');
    // Only show items the user could have plausibly seen — already dispatched
    // OR scheduled within the next minute (so the bell mirrors what the
    // dispatcher is about to fan out).
    qb.andWhere('(n.dispatched_at IS NOT NULL OR n.scheduled_at <= now())');
    qb.orderBy('n.scheduled_at', 'DESC').addOrderBy('n.id', 'DESC');
    qb.limit(Math.min(query.limit ?? 50, 200));
    const rows = await qb.getMany();
    return rows.map(NotificationResponseDto.from);
  }

  async unreadCount(ownerId: string): Promise<number> {
    return this.notifications
      .createQueryBuilder('n')
      .where('n.owner_id = :ownerId', { ownerId })
      .andWhere('n.read_at IS NULL')
      .andWhere('(n.dispatched_at IS NOT NULL OR n.scheduled_at <= now())')
      .getCount();
  }

  async markRead(ownerId: string, id: string): Promise<void> {
    const n = await this.notifications.findOne({ where: { id, ownerId } });
    if (!n) throw ApiException.notFound('Notification not found');
    if (!n.readAt) {
      n.readAt = new Date();
      await this.notifications.save(n);
    }
  }

  async markAllRead(ownerId: string): Promise<number> {
    const res = await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: () => 'now()' })
      .where('owner_id = :ownerId', { ownerId })
      .andWhere('read_at IS NULL')
      .execute();
    return res.affected ?? 0;
  }

  // ─── Push subscription management ───────────────────────────────────────────

  async subscribePush(
    ownerId: string,
    dto: PushSubscribeDto,
  ): Promise<void> {
    // Reuse an existing live row if endpoint matches (e.g. browser reissues
    // same subscription after permission re-grant) — just refresh keys and
    // ownership in case the device changed accounts.
    const existing = await this.subscriptions.findOne({
      where: { endpoint: dto.endpoint },
    });
    if (existing) {
      existing.ownerId = ownerId;
      existing.p256dh = dto.p256dh;
      existing.auth = dto.auth;
      existing.userAgent = dto.userAgent ?? existing.userAgent ?? null;
      existing.lastUsedAt = new Date();
      await this.subscriptions.save(existing);
      return;
    }
    await this.subscriptions.save(
      this.subscriptions.create({
        ownerId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent ?? null,
        lastUsedAt: new Date(),
      }),
    );
  }

  async unsubscribePush(ownerId: string, endpoint: string): Promise<void> {
    const sub = await this.subscriptions.findOne({
      where: { ownerId, endpoint },
    });
    if (!sub) return;
    await this.subscriptions.softRemove(sub);
  }

  async listSubscriptions(ownerId: string): Promise<PushSubscription[]> {
    return this.subscriptions.find({ where: { ownerId } });
  }

  async dropSubscriptionByEndpoint(endpoint: string): Promise<void> {
    const sub = await this.subscriptions.findOne({ where: { endpoint } });
    if (sub) await this.subscriptions.softRemove(sub);
  }

  // ─── Dispatcher hooks ───────────────────────────────────────────────────────

  /**
   * Fetch and mark a batch of notifications ready to fire. The caller (the
   * dispatcher service) is responsible for delivering each one via web-push.
   */
  async claimPending(now: Date, limit = 50): Promise<Notification[]> {
    return this.notifications.find({
      where: {
        scheduledAt: LessThanOrEqual(now),
        dispatchedAt: IsNull(),
      },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });
  }

  async markDispatched(id: string): Promise<void> {
    await this.notifications.update(id, { dispatchedAt: new Date() });
  }

  // ─── Config passthrough ─────────────────────────────────────────────────────

  getVapidPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') || null;
  }

  isPushConfigured(): boolean {
    return Boolean(
      this.config.get<string>('VAPID_PUBLIC_KEY') &&
        this.config.get<string>('VAPID_PRIVATE_KEY'),
    );
  }
}

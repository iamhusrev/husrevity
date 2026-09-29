import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEvent } from './outbox-event.entity';
import { PgBossService } from './pg-boss.service';

/**
 * Polls unprocessed outbox_events and enqueues each as a pg-boss job,
 * marking it processed on success. Skips the tick entirely when pg-boss
 * isn't ready (e.g. DB was unreachable at boot) rather than failing loudly
 * — the same rows just get picked up on a later tick once it recovers.
 */
@Injectable()
export class OutboxWorkerService {
  private readonly logger = new Logger(OutboxWorkerService.name);

  constructor(
    @InjectRepository(OutboxEvent) private readonly events: Repository<OutboxEvent>,
    private readonly pgBoss: PgBossService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'outbox-worker' })
  async tick(): Promise<void> {
    if (!this.pgBoss.isReady()) return;

    const pending = await this.events.find({
      where: { processedAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: 50,
    });
    if (pending.length === 0) return;

    for (const event of pending) {
      try {
        await this.pgBoss.enqueue(event.type, event.payload as object);
        event.processedAt = new Date();
        await this.events.save(event);
      } catch (e) {
        this.logger.error(
          `Failed to enqueue outbox event ${event.id} (${event.type}): ${(e as Error).message}`,
        );
      }
    }
  }
}

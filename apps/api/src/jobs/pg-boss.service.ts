import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';

/**
 * Thin wrapper around `pg-boss`, connected to the same Postgres database as
 * the rest of the app (its own `pgboss` schema, created automatically on
 * first start). Mirrors the VAPID-not-configured pattern elsewhere in this
 * app: if pg-boss can't start (DB unreachable, etc.), this logs a warning
 * and the rest of the app still boots — `enqueue`/`schedule` just throw if
 * called while not ready, rather than the whole process crashing at boot.
 */
@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss: PgBoss | null = null;
  private readonly knownQueues = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const boss = new PgBoss({ connectionString: this.buildConnectionString() });
    boss.on('error', (err: Error) => this.logger.error(`pg-boss error: ${err.message}`));
    try {
      await boss.start();
      this.boss = boss;
      this.logger.log('pg-boss started');
    } catch (e) {
      this.logger.warn(
        `pg-boss failed to start — job processing disabled until next boot: ${(e as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop();
  }

  isReady(): boolean {
    return this.boss !== null;
  }

  async enqueue(name: string, data?: object): Promise<string | null> {
    if (!this.boss) throw new Error('pg-boss is not ready');
    await this.ensureQueue(name);
    return this.boss.send(name, data ?? {});
  }

  async schedule(name: string, cron: string, data?: object): Promise<void> {
    if (!this.boss) throw new Error('pg-boss is not ready');
    await this.ensureQueue(name);
    await this.boss.schedule(name, cron, data ?? {});
  }

  async work<T = object>(
    name: string,
    handler: (job: { id: string; name: string; data: T }) => Promise<void>,
  ): Promise<string | null> {
    if (!this.boss) throw new Error('pg-boss is not ready');
    await this.ensureQueue(name);
    return this.boss.work(name, handler as any);
  }

  /**
   * pg-boss v10+ refuses send/schedule/work on a queue that was never
   * created ("Queue <name> not found"), so every entry point creates it on
   * first use. Cached per process; createQueue is skipped when the queue
   * already exists (e.g. created by a previous boot).
   */
  private async ensureQueue(name: string): Promise<void> {
    if (!this.boss || this.knownQueues.has(name)) return;
    if (!(await this.boss.getQueue(name))) {
      await this.boss.createQueue(name);
    }
    this.knownQueues.add(name);
  }

  private buildConnectionString(): string {
    const host = this.config.get<string>('HUSREVITY_DB_HOST') ?? 'localhost';
    const port = this.config.get<string>('HUSREVITY_DB_PORT') ?? '5432';
    const user = this.config.get<string>('HUSREVITY_DB_USER') ?? 'postgres';
    const password = this.config.get<string>('HUSREVITY_DB_PASSWORD') ?? 'postgres';
    const database = this.config.get<string>('HUSREVITY_DB_NAME') ?? 'husrevity_nest';
    return `postgres://${user}:${password}@${host}:${port}/${database}`;
  }
}

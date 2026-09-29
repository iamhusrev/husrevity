import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PgBossService } from './pg-boss.service';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxWorkerService } from './outbox-worker.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [PgBossService, OutboxService, OutboxWorkerService],
  exports: [PgBossService, OutboxService],
})
export class JobsModule {}

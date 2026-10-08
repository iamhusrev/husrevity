import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

/**
 * Transactional-outbox write side. Call `write()` from within the SAME
 * TypeORM transaction as the domain change it's recording — that's what
 * makes the outbox pattern atomic (the event can never be written without
 * the domain change, or vice versa). No domain service calls this yet;
 * the outbox worker (a later item) is the read/consume side.
 */
@Injectable()
export class OutboxService {
  constructor(@InjectRepository(OutboxEvent) private readonly events: Repository<OutboxEvent>) {}

  async write(type: string, payload: object): Promise<void> {
    await this.events.save(this.events.create({ type, payload, processedAt: null }));
  }
}

import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { BaseEntity } from './base.entity';
import { getCurrentUserId } from './request-context';

/**
 * Port of Spring Data Auditing (@CreatedBy / @LastModifiedBy + AuditorAware).
 * Sets created_by_id on insert and updated_by_id on insert+update for every entity
 * that extends BaseEntity. Reads the current user from RequestContext (AsyncLocalStorage).
 */
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<unknown>): void {
    const entity = event.entity;
    if (!(entity instanceof BaseEntity)) return;
    const userId = getCurrentUserId();
    if (userId) {
      if (entity.createdById == null) entity.createdById = userId;
      if (entity.updatedById == null) entity.updatedById = userId;
    }
  }

  beforeUpdate(event: UpdateEvent<unknown>): void {
    const entity = event.entity;
    if (!entity || !(entity instanceof BaseEntity)) return;
    const userId = getCurrentUserId();
    if (userId) {
      entity.updatedById = userId;
    }
  }
}

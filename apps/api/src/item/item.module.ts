import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './item.entity';
import { ItemOccurrence } from './item-occurrence.entity';
import { ItemService } from './item.service';
import { ItemRecurrenceService } from './item-recurrence.service';
import { ItemController } from './item.controller';
import { ProjectModule } from '../project/project.module';
import { NotificationModule } from '../notification/notification.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { IdempotencyKey } from '../common/idempotency-key.entity';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, ItemOccurrence, IdempotencyKey]),
    ProjectModule,
    NotificationModule,
    IntegrationsModule,
  ],
  providers: [ItemService, ItemRecurrenceService, IdempotencyInterceptor],
  controllers: [ItemController],
  exports: [ItemService],
})
export class ItemModule {}

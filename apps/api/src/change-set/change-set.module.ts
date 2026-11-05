import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeSet } from './entities/change-set.entity';
import { ChangeEntry } from './entities/change-entry.entity';
import { Item } from '../item/item.entity';
import { ItemOccurrence } from '../item/item-occurrence.entity';
import { ChangeSetService } from './change-set.service';
import { ChangeSetController } from './change-set.controller';
import { ItemModule } from '../item/item.module';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChangeSet, ChangeEntry, Item, ItemOccurrence]),
    ItemModule,
    LearningModule,
  ],
  controllers: [ChangeSetController],
  providers: [ChangeSetService],
  exports: [ChangeSetService],
})
export class ChangeSetModule {}

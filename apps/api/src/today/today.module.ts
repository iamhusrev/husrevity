import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../item/item.entity';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';
import { ItemRecurrenceService } from '../item/item-recurrence.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item])],
  controllers: [TodayController],
  providers: [TodayService, ItemRecurrenceService],
  exports: [TodayService],
})
export class TodayModule {}

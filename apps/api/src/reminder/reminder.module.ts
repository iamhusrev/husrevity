import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReminderList } from './reminder-list.entity';
import { Reminder } from './reminder.entity';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';
import { NotificationModule } from '../notification/notification.module';
import { ItemMirrorModule } from '../item-mirror/item-mirror.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReminderList, Reminder]),
    NotificationModule,
    ItemMirrorModule,
  ],
  providers: [ReminderService],
  controllers: [ReminderController],
  exports: [ReminderService],
})
export class ReminderModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReminderList } from './reminder-list.entity';
import { Reminder } from './reminder.entity';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReminderList, Reminder]),
    NotificationModule,
  ],
  providers: [ReminderService],
  controllers: [ReminderController],
  exports: [ReminderService],
})
export class ReminderModule {}

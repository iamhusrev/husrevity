import { Module } from '@nestjs/common';
import { TelegramCoreModule } from './telegram-core.module';
import { TelegramMessageHandlerService } from './telegram-message-handler.service';
import { TelegramPollerService } from './telegram-poller.service';
import { TelegramController } from './telegram.controller';
import { ItemModule } from '../item/item.module';
import { ReminderModule } from '../reminder/reminder.module';

@Module({
  imports: [TelegramCoreModule, ItemModule, ReminderModule],
  controllers: [TelegramController],
  providers: [TelegramMessageHandlerService, TelegramPollerService],
  exports: [TelegramCoreModule, TelegramMessageHandlerService, TelegramPollerService],
})
export class TelegramModule {}

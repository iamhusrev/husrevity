import { Module } from '@nestjs/common';
import { SlackCoreModule } from './slack-core.module';
import { SlackMessageHandlerService } from './slack-message-handler.service';
import { SlackSocketModeService } from './slack-socket-mode.service';
import { SlackController } from './slack.controller';
import { ItemModule } from '../item/item.module';

@Module({
  imports: [SlackCoreModule, ItemModule],
  controllers: [SlackController],
  providers: [SlackMessageHandlerService, SlackSocketModeService],
  exports: [SlackCoreModule, SlackMessageHandlerService, SlackSocketModeService],
})
export class SlackModule {}

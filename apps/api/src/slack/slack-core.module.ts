import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlackLink } from './slack-link.entity';
import { SlackConfig } from './slack.config';
import { SlackApiService } from './slack-api.service';
import { SlackLinkService } from './slack-link.service';
import { SlackNotifier } from './slack.notifier';

/**
 * Deliberately split from SlackModule: this module has zero dependency
 * on ItemModule (and, transitively, ProjectModule/NotificationModule) —
 * only `SlackConfig`/`SlackApiService`/`SlackLinkService`/
 * `SlackNotifier` live here. `NotificationModule` imports THIS module
 * (not the full `SlackModule`) specifically so it can use
 * `SlackNotifier` as a delivery channel without creating a module
 * import cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SlackLink])],
  providers: [
    SlackConfig,
    SlackApiService,
    SlackLinkService,
    SlackNotifier,
  ],
  exports: [
    SlackConfig,
    SlackApiService,
    SlackLinkService,
    SlackNotifier,
  ],
})
export class SlackCoreModule {}

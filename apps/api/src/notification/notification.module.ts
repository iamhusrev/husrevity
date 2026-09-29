import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { MailerService } from './mailer.service';
import { WebPushNotifier } from './web-push.notifier';
import { UserModule } from '../user/user.module';
import { TelegramCoreModule } from '../telegram/telegram-core.module';
import { DeviceModule } from '../device/device.module';
import { SlackCoreModule } from '../slack/slack-core.module';

/**
 * Central notification hub. Exported `NotificationService` is imported by
 * every scheduled-entity module (reminder, task, list, calendar, time-block)
 * to enqueue/cancel on entity mutations.
 *
 * `NotificationDispatcherService` is wired up here as a provider but has no
 * outside consumer — its lifecycle is the @Cron schedule. It reaches into
 * UserModule (re-exported TypeOrmModule.forFeature([User])) to look up the
 * recipient's email + per-user email-notifications opt-in flag.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, PushSubscription]),
    UserModule,
    // TelegramCoreModule, not the full TelegramModule — see
    // telegram-core.module.ts's docblock for why: TelegramModule needs
    // ItemModule (for quick-add), and ItemModule already imports
    // NotificationModule (directly, and via ProjectModule), so importing
    // the full TelegramModule here would close a real module cycle.
    TelegramCoreModule,
    DeviceModule,
    SlackCoreModule,
  ],
  providers: [NotificationService, NotificationDispatcherService, MailerService, WebPushNotifier],
  controllers: [NotificationController],
  exports: [NotificationService, MailerService],
})
export class NotificationModule {}

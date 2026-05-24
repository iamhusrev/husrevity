import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { MailerService } from './mailer.service';
import { UserModule } from '../user/user.module';

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
  ],
  providers: [NotificationService, NotificationDispatcherService, MailerService],
  controllers: [NotificationController],
  exports: [NotificationService, MailerService],
})
export class NotificationModule {}

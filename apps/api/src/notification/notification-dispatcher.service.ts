import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as webpush from 'web-push';
import { NotificationService } from './notification.service';
import { Notification } from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import { MailerService } from './mailer.service';
import { UserService } from '../user/user.service';

/**
 * Per-minute cron that finds notifications whose `scheduled_at <= now()` and
 * fans them out to every channel the recipient has enabled:
 *
 *   1. Web Push — to every active push_subscription. Always attempted when
 *      VAPID is configured. 410/404 from the push endpoint soft-deletes the
 *      subscription so we stop trying.
 *   2. Email — only if the user has emailNotificationsEnabled = true and
 *      SMTP (MAIL_* env) is configured. Failures are swallowed (log only)
 *      so a flaky SMTP doesn't poison the loop.
 *
 * The `notification` row persists regardless of channel delivery — the bell
 * dropdown reads from the same table, so a user without any channel still
 * sees items appear once their scheduled time hits. `dispatched_at` is set
 * before the channels fire, so a delivery hang won't re-trigger next tick.
 */
@Injectable()
export class NotificationDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private vapidReady = false;
  private webBaseUrl = 'http://localhost:3090';

  constructor(
    private readonly notifications: NotificationService,
    private readonly mailer: MailerService,
    private readonly users: UserService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.webBaseUrl =
      this.config.get<string>('HUSREVITY_WEB_URL') ?? 'http://localhost:3090';
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') || 'mailto:owner@example.com';
    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not configured — web-push disabled. ' +
          'In-app bell still works; OS notifications will not fire. ' +
          'Generate with: bunx web-push generate-vapid-keys',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidReady = true;
      this.logger.log('Web Push initialised');
    } catch (e) {
      this.logger.error(`Failed to init web-push: ${(e as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'notification-dispatch' })
  async tick(): Promise<void> {
    const now = new Date();
    const pending = await this.notifications.claimPending(now, 100);
    if (pending.length === 0) return;
    this.logger.debug(`Dispatching ${pending.length} notification(s)`);

    // Mark all dispatched first to make this idempotent under overlap — even
    // if a push delivery hangs, we won't re-fire the same row next tick.
    for (const n of pending) {
      try {
        await this.notifications.markDispatched(n.id);
      } catch (e) {
        this.logger.error(
          `markDispatched failed for ${n.id}: ${(e as Error).message}`,
        );
      }
    }

    // Group by owner so we open subscriptions / look up the user once per owner.
    const byOwner = new Map<string, Notification[]>();
    for (const n of pending) {
      const list = byOwner.get(n.ownerId) ?? [];
      list.push(n);
      byOwner.set(n.ownerId, list);
    }

    for (const [ownerId, items] of byOwner) {
      const subs = this.vapidReady
        ? await this.notifications.listSubscriptions(ownerId)
        : [];
      // Look up the user once per owner — used by the email leg + skipped
      // if they've opted out / SMTP isn't configured.
      const user = await this.users.findById(ownerId).catch(() => null);
      const emailEnabled =
        Boolean(user?.emailNotificationsEnabled) &&
        this.mailer.isConfigured() &&
        Boolean(user?.email);

      for (const n of items) {
        if (subs.length > 0) await this.sendPush(n, subs);
        if (emailEnabled && user) {
          await this.mailer.sendNotificationEmail(user.email, n, this.webBaseUrl);
        }
      }
    }
  }

  private async sendPush(
    n: Notification,
    subs: PushSubscription[],
  ): Promise<void> {
    const payload = JSON.stringify({
      id: n.id,
      title: n.title,
      body: n.body ?? '',
      deepLink: n.deepLink ?? '/dashboard',
      kind: n.kind,
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 600 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription gone — drop it so we don't keep trying.
          this.logger.log(
            `Dropping expired subscription (${status}) for owner ${sub.ownerId}`,
          );
          await this.notifications
            .dropSubscriptionByEndpoint(sub.endpoint)
            .catch(() => undefined);
        } else {
          this.logger.warn(
            `web-push failed (${status ?? '?'}): ${(err as Error).message}`,
          );
        }
      }
    }
  }
}

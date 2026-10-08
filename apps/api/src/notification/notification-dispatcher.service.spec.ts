import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationService } from './notification.service';
import { MailerService } from './mailer.service';
import { UserService } from '../user/user.service';
import { WebPushNotifier } from './web-push.notifier';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { TelegramNotifier } from '../telegram/telegram.notifier';
import { Notification } from './notification.entity';
import { TelegramLink } from '../telegram/telegram-link.entity';
import { DeviceService } from '../device/device.service';
import { ExpoPushNotifier } from '../device/expo-push.notifier';
import { Device } from '../device/device.entity';
import { SlackLinkService } from '../slack/slack-link.service';
import { SlackNotifier } from '../slack/slack.notifier';
import { SlackLink } from '../slack/slack-link.entity';

describe('NotificationDispatcherService', () => {
  let dispatcher: NotificationDispatcherService;
  let notifications: jest.Mocked<NotificationService>;
  let mailer: jest.Mocked<MailerService>;
  let users: jest.Mocked<UserService>;
  let config: jest.Mocked<ConfigService>;
  let webPush: jest.Mocked<WebPushNotifier>;
  let telegramLinkService: jest.Mocked<TelegramLinkService>;
  let telegramNotifier: jest.Mocked<TelegramNotifier>;
  let deviceService: jest.Mocked<DeviceService>;
  let expoPushNotifier: jest.Mocked<ExpoPushNotifier>;
  let slackLinkService: jest.Mocked<SlackLinkService>;
  let slackNotifier: jest.Mocked<SlackNotifier>;

  beforeEach(async () => {
    notifications = {
      claimPending: jest.fn().mockResolvedValue([]),
      markDispatched: jest.fn().mockResolvedValue(undefined),
      listSubscriptions: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationService>;

    mailer = {
      isConfigured: jest.fn().mockReturnValue(false),
      sendNotificationEmail: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<MailerService>;

    users = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<UserService>;

    config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'HUSREVITY_WEB_URL') return 'http://localhost:3090';
        return null;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    webPush = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebPushNotifier>;

    telegramLinkService = {
      findByOwner: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TelegramLinkService>;

    telegramNotifier = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TelegramNotifier>;

    deviceService = {
      findActiveForOwner: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DeviceService>;

    expoPushNotifier = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ExpoPushNotifier>;

    slackLinkService = {
      findByOwner: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<SlackLinkService>;

    slackNotifier = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SlackNotifier>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatcherService,
        { provide: NotificationService, useValue: notifications },
        { provide: MailerService, useValue: mailer },
        { provide: UserService, useValue: users },
        { provide: ConfigService, useValue: config },
        { provide: WebPushNotifier, useValue: webPush },
        { provide: TelegramLinkService, useValue: telegramLinkService },
        { provide: TelegramNotifier, useValue: telegramNotifier },
        { provide: DeviceService, useValue: deviceService },
        { provide: ExpoPushNotifier, useValue: expoPushNotifier },
        { provide: SlackLinkService, useValue: slackLinkService },
        { provide: SlackNotifier, useValue: slackNotifier },
      ],
    }).compile();

    dispatcher = module.get<NotificationDispatcherService>(NotificationDispatcherService);
  });

  it('should be defined', () => {
    expect(dispatcher).toBeDefined();
  });

  describe('dispatchOne', () => {
    const mockNotification = {
      id: 'notif-1',
      ownerId: 'user-1',
      title: 'Task Due',
      body: 'Do unit tests',
      kind: 'task',
      deepLink: '/tasks/1',
      scheduledAt: new Date(),
      dispatchedAt: null,
      createdAt: new Date(),
    } as unknown as Notification;

    it('returns reason when no delivery channels are available', async () => {
      const result = await dispatcher.dispatchOne(mockNotification);

      expect(result).toEqual({
        pushAttempted: false,
        pushSucceeded: false,
        emailAttempted: false,
        emailSucceeded: false,
        telegramAttempted: false,
        telegramSucceeded: false,
        expoAttempted: false,
        expoSucceeded: false,
        slackAttempted: false,
        slackSucceeded: false,
        reason: 'vapid-not-configured',
      });
    });

    it('attempts telegram delivery when linked telegram_link exists', async () => {
      const mockLink: TelegramLink = {
        id: 'link-1',
        ownerId: 'user-1',
        chatId: '987654321',
        status: 'linked',
      } as TelegramLink;

      telegramLinkService.findByOwner.mockResolvedValue(mockLink);

      const result = await dispatcher.dispatchOne(mockNotification);

      expect(telegramNotifier.send).toHaveBeenCalledWith(mockLink, {
        id: 'notif-1',
        title: 'Task Due',
        body: 'Do unit tests',
        deepLink: '/tasks/1',
        kind: 'task',
      });
      expect(result.telegramAttempted).toBe(true);
      expect(result.telegramSucceeded).toBe(true);
    });

    it('attempts expo push delivery when mobile devices exist', async () => {
      const mockDevice: Device = {
        id: 'dev-1',
        ownerId: 'user-1',
        platform: 'ios',
        pushToken: 'ExponentPushToken[123]',
      } as Device;

      deviceService.findActiveForOwner.mockResolvedValue([mockDevice]);

      const result = await dispatcher.dispatchOne(mockNotification);

      expect(expoPushNotifier.send).toHaveBeenCalledWith(mockDevice, {
        id: 'notif-1',
        title: 'Task Due',
        body: 'Do unit tests',
        deepLink: '/tasks/1',
        kind: 'task',
      });
      expect(result.expoAttempted).toBe(true);
      expect(result.expoSucceeded).toBe(true);
    });

    it('attempts slack delivery when linked slack_link exists', async () => {
      const mockLink: SlackLink = {
        id: 'slack-link-1',
        ownerId: 'user-1',
        slackUserId: 'U12345678',
        status: 'linked',
      } as SlackLink;

      slackLinkService.findByOwner.mockResolvedValue(mockLink);

      const result = await dispatcher.dispatchOne(mockNotification);

      expect(slackNotifier.send).toHaveBeenCalledWith(mockLink, {
        id: 'notif-1',
        title: 'Task Due',
        body: 'Do unit tests',
        deepLink: '/tasks/1',
        kind: 'task',
      });
      expect(result.slackAttempted).toBe(true);
      expect(result.slackSucceeded).toBe(true);
    });

    it('handles telegram delivery failure gracefully', async () => {
      const mockLink: TelegramLink = {
        id: 'link-1',
        ownerId: 'user-1',
        chatId: '987654321',
        status: 'linked',
      } as TelegramLink;

      telegramLinkService.findByOwner.mockResolvedValue(mockLink);
      telegramNotifier.send.mockRejectedValue(new Error('Network error'));

      const result = await dispatcher.dispatchOne(mockNotification);

      expect(result.telegramAttempted).toBe(true);
      expect(result.telegramSucceeded).toBe(false);
    });

    it('handles slack delivery failure gracefully', async () => {
      const mockLink: SlackLink = {
        id: 'slack-link-1',
        ownerId: 'user-1',
        slackUserId: 'U12345678',
        status: 'linked',
      } as SlackLink;

      slackLinkService.findByOwner.mockResolvedValue(mockLink);
      slackNotifier.send.mockRejectedValue(new Error('Slack API error'));

      const result = await dispatcher.dispatchOne(mockNotification);

      expect(result.slackAttempted).toBe(true);
      expect(result.slackSucceeded).toBe(false);
    });
  });

  describe('tick', () => {
    it('claims pending notifications and dispatches them', async () => {
      const mockNotification = {
        id: 'notif-10',
        ownerId: 'user-2',
        title: 'Meeting',
        body: 'Team sync',
        kind: 'calendar',
        deepLink: '/calendar',
        scheduledAt: new Date(),
        dispatchedAt: null,
        createdAt: new Date(),
      } as unknown as Notification;

      notifications.claimPending.mockResolvedValue([mockNotification]);
      telegramLinkService.findByOwner.mockResolvedValue({
        chatId: '555',
        status: 'linked',
      } as TelegramLink);

      await dispatcher.tick();

      expect(notifications.markDispatched).toHaveBeenCalledWith('notif-10');
      expect(telegramNotifier.send).toHaveBeenCalled();
    });
  });
});

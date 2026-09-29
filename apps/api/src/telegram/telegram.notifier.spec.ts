import { Test, TestingModule } from '@nestjs/testing';
import { TelegramNotifier } from './telegram.notifier';
import { TelegramApiService } from './telegram-api.service';
import { TelegramLink } from './telegram-link.entity';

describe('TelegramNotifier', () => {
  let notifier: TelegramNotifier;
  let telegramApi: jest.Mocked<TelegramApiService>;

  beforeEach(async () => {
    telegramApi = {
      sendMessage: jest.fn(),
    } as unknown as jest.Mocked<TelegramApiService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramNotifier,
        { provide: TelegramApiService, useValue: telegramApi },
      ],
    }).compile();

    notifier = module.get<TelegramNotifier>(TelegramNotifier);
  });

  it('should be defined', () => {
    expect(notifier).toBeDefined();
  });

  it('sends notification text when target is linked and has chatId', async () => {
    telegramApi.sendMessage.mockResolvedValue({ message_id: 123 } as any);
    const link = { chatId: '12345678', status: 'linked' } as TelegramLink;
    const payload = {
      id: 'notif-1',
      title: 'Task Reminder',
      body: 'Do something',
      deepLink: '/tasks/1',
      kind: 'reminder',
    };

    await notifier.send(link, payload);

    expect(telegramApi.sendMessage).toHaveBeenCalledWith(
      '12345678',
      'Task Reminder\nDo something',
    );
  });

  it('formats payload with title only when body is empty', async () => {
    telegramApi.sendMessage.mockResolvedValue({ message_id: 124 } as any);
    const link = { chatId: '12345678', status: 'linked' } as TelegramLink;
    const payload = {
      id: 'notif-2',
      title: 'Quick Alert',
      body: '',
      deepLink: '/dashboard',
      kind: 'alert',
    };

    await notifier.send(link, payload);

    expect(telegramApi.sendMessage).toHaveBeenCalledWith(
      '12345678',
      'Quick Alert',
    );
  });

  it('skips send if link has no chatId or status is not linked', async () => {
    const linkUnlinked = { chatId: '12345', status: 'unlinked' } as TelegramLink;
    const linkNoChat = { chatId: null, status: 'linked' } as unknown as TelegramLink;
    const payload = {
      id: 'notif-3',
      title: 'Alert',
      body: 'Body',
      deepLink: '/',
      kind: 'alert',
    };

    await notifier.send(linkUnlinked, payload);
    await notifier.send(linkNoChat, payload);

    expect(telegramApi.sendMessage).not.toHaveBeenCalled();
  });

  it('throws error when sendMessage returns null', async () => {
    telegramApi.sendMessage.mockResolvedValue(null);
    const link = { chatId: '12345678', status: 'linked' } as TelegramLink;
    const payload = {
      id: 'notif-4',
      title: 'Title',
      body: 'Body',
      deepLink: '/',
      kind: 'alert',
    };

    await expect(notifier.send(link, payload)).rejects.toThrow(
      'Telegram sendMessage failed for chatId 12345678',
    );
  });
});

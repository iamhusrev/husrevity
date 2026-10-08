import { Test, TestingModule } from '@nestjs/testing';
import { TelegramMessageHandlerService } from './telegram-message-handler.service';
import { TelegramApiService, TelegramUpdate } from './telegram-api.service';
import { TelegramLinkService } from './telegram-link.service';
import { ItemService } from '../item/item.service';
import { ReminderService } from '../reminder/reminder.service';
import { TelegramLink } from './telegram-link.entity';
import { ApiException } from '../common/api.exception';

describe('TelegramMessageHandlerService', () => {
  let service: TelegramMessageHandlerService;
  let telegramApi: jest.Mocked<TelegramApiService>;
  let telegramLinkService: jest.Mocked<TelegramLinkService>;
  let itemService: jest.Mocked<ItemService>;
  let reminderService: jest.Mocked<ReminderService>;

  beforeEach(async () => {
    const mockTelegramApi = {
      sendMessage: jest.fn().mockResolvedValue(null),
    };

    const mockTelegramLinkService = {
      findByChatId: jest.fn().mockResolvedValue(null),
      confirmLink: jest.fn(),
      unlink: jest.fn(),
    };

    const mockItemService = {
      create: jest.fn(),
    };

    const mockReminderService = {
      createReminder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramMessageHandlerService,
        { provide: TelegramApiService, useValue: mockTelegramApi },
        { provide: TelegramLinkService, useValue: mockTelegramLinkService },
        { provide: ItemService, useValue: mockItemService },
        { provide: ReminderService, useValue: mockReminderService },
      ],
    }).compile();

    service = module.get<TelegramMessageHandlerService>(TelegramMessageHandlerService);
    telegramApi = module.get(TelegramApiService);
    telegramLinkService = module.get(TelegramLinkService);
    itemService = module.get(ItemService);
    reminderService = module.get(ReminderService);
  });

  it('should ignore updates without message or text', async () => {
    await service.handleUpdate({ update_id: 1 } as TelegramUpdate);
    await service.handleUpdate({
      update_id: 2,
      message: { message_id: 10, chat: { id: 123, type: 'private' }, date: 1000 },
    } as TelegramUpdate);

    expect(telegramApi.sendMessage).not.toHaveBeenCalled();
  });

  describe('/start and /link commands', () => {
    it('should prompt unlinked user for link code when no arg is provided', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce(null);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: '/start',
        },
      };

      await service.handleUpdate(update);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Lütfen hesabınızı bağlamak için'),
      );
    });

    it('should inform linked user that account is already connected when no arg is provided', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-1',
        chatId: '12345',
        status: 'linked',
      } as TelegramLink);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: '/start@husrevity_bot',
        },
      };

      await service.handleUpdate(update);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('zaten bağlı'),
      );
    });

    it('should confirm link successfully when valid code is supplied', async () => {
      telegramLinkService.confirmLink.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-1',
        chatId: '12345',
        status: 'linked',
      } as TelegramLink);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: '/link A1B2C3',
        },
      };

      await service.handleUpdate(update);

      expect(telegramLinkService.confirmLink).toHaveBeenCalledWith('A1B2C3', '12345');
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('başarıyla bağlandı'),
      );
    });

    it('should handle error when link code is invalid or expired', async () => {
      telegramLinkService.confirmLink.mockRejectedValueOnce(
        ApiException.badRequest('Invalid link code'),
      );

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: '/start INVALID',
        },
      };

      await service.handleUpdate(update);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Bağlama başarısız: Invalid link code'),
      );
    });
  });

  describe('/unlink command', () => {
    it('should unlink Telegram account successfully', async () => {
      telegramLinkService.unlink.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-1',
        chatId: null,
        status: 'unlinked',
      } as TelegramLink);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: '/unlink',
        },
      };

      await service.handleUpdate(update);

      expect(telegramLinkService.unlink).toHaveBeenCalledWith(undefined, '12345');
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('bağlantısı kaldırıldı'),
      );
    });

    it('should handle error when unlinking fails', async () => {
      telegramLinkService.unlink.mockRejectedValueOnce(
        ApiException.notFound('Telegram link not found'),
      );

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: '/unlink',
        },
      };

      await service.handleUpdate(update);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Bağı kaldırma başarısız'),
      );
    });
  });

  describe('Quick-add messages', () => {
    it('should ask unlinked chat to link account first', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce(null);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: 'yarın 9da HGS kontrol #alican',
        },
      };

      await service.handleUpdate(update);

      expect(itemService.create).not.toHaveBeenCalled();
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Lütfen önce Husrevity hesabınızı bağlayın'),
      );
    });

    it('should create a reminder due at the parsed time for a linked user', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        chatId: '12345',
        status: 'linked',
      } as TelegramLink);
      reminderService.createReminder.mockResolvedValueOnce({
        id: 'r-1',
        title: 'HGS kontrol',
      } as any);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: 'yarın 9da HGS kontrol #alican',
        },
      };

      await service.handleUpdate(update);

      expect(reminderService.createReminder).toHaveBeenCalledWith(
        'user-42',
        expect.objectContaining({
          title: 'HGS kontrol',
          dueAt: expect.any(String),
          notifyMinutesBefore: 0,
        }),
      );
      expect(itemService.create).not.toHaveBeenCalled();
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringMatching(/^⏰ Anımsatıcı eklendi: "HGS kontrol" — /),
      );
    });

    it('should create a reminder without a notification when no time is given', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        chatId: '12345',
        status: 'linked',
      } as TelegramLink);
      reminderService.createReminder.mockResolvedValueOnce({ id: 'r-2', title: 'süt al' } as any);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: 'süt al',
        },
      };

      await service.handleUpdate(update);

      expect(reminderService.createReminder).toHaveBeenCalledWith(
        'user-42',
        expect.objectContaining({ title: 'süt al', notifyMinutesBefore: null }),
      );
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        '⏰ Anımsatıcı eklendi: "süt al"',
      );
    });

    it('should store a recurring message as a recurring task instead of a reminder', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        chatId: '12345',
        status: 'linked',
      } as TelegramLink);
      itemService.create.mockResolvedValueOnce({ id: 'i-1', title: 'vitamin' } as any);

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: 'her gün 9da vitamin',
        },
      };

      await service.handleUpdate(update);

      expect(reminderService.createReminder).not.toHaveBeenCalled();
      expect(itemService.create).toHaveBeenCalledWith(
        'user-42',
        expect.objectContaining({
          kind: 'task',
          title: 'vitamin',
          rrule: expect.any(String),
          source: 'telegram',
        }),
      );
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('🔁 Tekrarlayan görev eklendi: "vitamin"'),
      );
    });

    it('should handle reminder creation error gracefully', async () => {
      telegramLinkService.findByChatId.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        chatId: '12345',
        status: 'linked',
      } as TelegramLink);

      reminderService.createReminder.mockRejectedValueOnce(new Error('Database error'));

      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          date: 1000,
          text: 'test task',
        },
      };

      await service.handleUpdate(update);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '12345',
        expect.stringContaining('Anımsatıcı eklenirken bir hata oluştu: Database error'),
      );
    });
  });
});

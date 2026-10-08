import { Test, TestingModule } from '@nestjs/testing';
import { SlackMessageHandlerService } from './slack-message-handler.service';
import { SlackApiService } from './slack-api.service';
import { SlackLinkService } from './slack-link.service';
import { ItemService } from '../item/item.service';
import { ReminderService } from '../reminder/reminder.service';
import { SlackLink } from './slack-link.entity';
import { ApiException } from '../common/api.exception';

describe('SlackMessageHandlerService', () => {
  let service: SlackMessageHandlerService;
  let slackApiService: jest.Mocked<SlackApiService>;
  let slackLinkService: jest.Mocked<SlackLinkService>;
  let itemService: jest.Mocked<ItemService>;
  let reminderService: jest.Mocked<ReminderService>;

  beforeEach(async () => {
    const mockSlackApi = {
      postMessage: jest.fn().mockResolvedValue(null),
    };

    const mockSlackLinkService = {
      findBySlackUser: jest.fn().mockResolvedValue(null),
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
        SlackMessageHandlerService,
        { provide: SlackApiService, useValue: mockSlackApi },
        { provide: SlackLinkService, useValue: mockSlackLinkService },
        { provide: ItemService, useValue: mockItemService },
        { provide: ReminderService, useValue: mockReminderService },
      ],
    }).compile();

    service = module.get<SlackMessageHandlerService>(SlackMessageHandlerService);
    slackApiService = module.get(SlackApiService);
    slackLinkService = module.get(SlackLinkService);
    itemService = module.get(ItemService);
    reminderService = module.get(ReminderService);
  });

  it('should ignore invalid or non-DM events', async () => {
    // Null payload
    await service.handleEvent(null as any);

    // Non-message event type
    await service.handleEvent({
      event: { type: 'reaction_added', channel_type: 'im' },
    });

    // Channel type not IM
    await service.handleEvent({
      event: { type: 'message', channel_type: 'channel', text: 'hello' },
    });

    // Bot message
    await service.handleEvent({
      event: {
        type: 'message',
        channel_type: 'im',
        bot_id: 'B123',
        text: 'bot message',
      },
    });

    // Message subtype
    await service.handleEvent({
      event: {
        type: 'message',
        channel_type: 'im',
        subtype: 'message_changed',
        text: 'edited',
      },
    });

    // Empty text
    await service.handleEvent({
      event: { type: 'message', channel_type: 'im', text: '   ' },
    });

    expect(slackApiService.postMessage).not.toHaveBeenCalled();
  });

  describe('link command', () => {
    it('should prompt user when link code is missing', async () => {
      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'link',
        },
      };

      await service.handleEvent(payload);

      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('Lütfen hesabınızı bağlamak için'),
      );
    });

    it('should confirm link successfully when valid code is supplied', async () => {
      slackLinkService.confirmLink.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-1',
        slackUserId: 'U123',
        status: 'linked',
      } as SlackLink);

      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'link A1B2C3',
        },
      };

      await service.handleEvent(payload);

      expect(slackLinkService.confirmLink).toHaveBeenCalledWith('A1B2C3', 'U123');
      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('başarıyla bağlandı'),
      );
    });

    it('should handle error when link code is invalid or expired', async () => {
      slackLinkService.confirmLink.mockRejectedValueOnce(
        ApiException.badRequest('Invalid link code'),
      );

      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'link INVALID',
        },
      };

      await service.handleEvent(payload);

      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('Bağlama başarısız: Invalid link code'),
      );
    });
  });

  describe('unlink command', () => {
    it('should unlink Slack account successfully', async () => {
      slackLinkService.unlink.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-1',
        slackUserId: null,
        status: 'unlinked',
      } as SlackLink);

      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'unlink',
        },
      };

      await service.handleEvent(payload);

      expect(slackLinkService.unlink).toHaveBeenCalledWith(undefined, 'U123');
      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('bağlantısı kaldırıldı'),
      );
    });

    it('should handle error when unlinking fails', async () => {
      slackLinkService.unlink.mockRejectedValueOnce(ApiException.notFound('Slack link not found'));

      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'unlink',
        },
      };

      await service.handleEvent(payload);

      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('Bağı kaldırma başarısız'),
      );
    });
  });

  describe('Quick-add messages', () => {
    it('should ask unlinked user to link account first', async () => {
      slackLinkService.findBySlackUser.mockResolvedValueOnce(null);

      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'yarın 9da HGS kontrol #alican',
        },
      };

      await service.handleEvent(payload);

      expect(itemService.create).not.toHaveBeenCalled();
      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('Lütfen önce Husrevity hesabınızı bağlayın'),
      );
    });

    it('should create a reminder due at the parsed time for a linked user', async () => {
      slackLinkService.findBySlackUser.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        slackUserId: 'U123',
        status: 'linked',
      } as SlackLink);
      reminderService.createReminder.mockResolvedValueOnce({
        id: 'r-1',
        title: 'HGS kontrol',
      } as any);

      await service.handleEvent({
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'yarın 9da HGS kontrol #alican',
        },
      });

      expect(reminderService.createReminder).toHaveBeenCalledWith(
        'user-42',
        expect.objectContaining({
          title: 'HGS kontrol',
          dueAt: expect.any(String),
          notifyMinutesBefore: 0,
        }),
      );
      expect(itemService.create).not.toHaveBeenCalled();
      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringMatching(/^⏰ Anımsatıcı eklendi: "HGS kontrol" — /),
      );
    });

    it('should create a reminder without a notification when no time is given', async () => {
      slackLinkService.findBySlackUser.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        slackUserId: 'U123',
        status: 'linked',
      } as SlackLink);
      reminderService.createReminder.mockResolvedValueOnce({ id: 'r-2', title: 'süt al' } as any);

      await service.handleEvent({
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'süt al',
        },
      });

      expect(reminderService.createReminder).toHaveBeenCalledWith(
        'user-42',
        expect.objectContaining({ title: 'süt al', notifyMinutesBefore: null }),
      );
      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        '⏰ Anımsatıcı eklendi: "süt al"',
      );
    });

    it('should store a recurring message as a recurring task instead of a reminder', async () => {
      slackLinkService.findBySlackUser.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        slackUserId: 'U123',
        status: 'linked',
      } as SlackLink);
      itemService.create.mockResolvedValueOnce({ id: 'i-1', title: 'vitamin' } as any);

      await service.handleEvent({
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'her gün 9da vitamin',
        },
      });

      expect(reminderService.createReminder).not.toHaveBeenCalled();
      expect(itemService.create).toHaveBeenCalledWith(
        'user-42',
        expect.objectContaining({
          kind: 'task',
          title: 'vitamin',
          rrule: expect.any(String),
          source: 'slack',
        }),
      );
      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('🔁 Tekrarlayan görev eklendi: "vitamin"'),
      );
    });

    it('should handle reminder creation error gracefully', async () => {
      slackLinkService.findBySlackUser.mockResolvedValueOnce({
        id: 'link-1',
        ownerId: 'user-42',
        slackUserId: 'U123',
        status: 'linked',
      } as SlackLink);

      reminderService.createReminder.mockRejectedValueOnce(new Error('Database error'));

      const payload = {
        event: {
          type: 'message',
          channel_type: 'im',
          channel: 'D123',
          user: 'U123',
          text: 'test task',
        },
      };

      await service.handleEvent(payload);

      expect(slackApiService.postMessage).toHaveBeenCalledWith(
        'D123',
        expect.stringContaining('Anımsatıcı eklenirken bir hata oluştu: Database error'),
      );
    });
  });

  it('should not throw unhandled exception if unexpected error occurs', async () => {
    slackLinkService.findBySlackUser.mockImplementationOnce(() => {
      throw new Error('Catastrophic failure');
    });

    const payload = {
      event: {
        type: 'message',
        channel_type: 'im',
        channel: 'D123',
        user: 'U123',
        text: 'some message',
      },
    };

    await expect(service.handleEvent(payload)).resolves.not.toThrow();
  });
});

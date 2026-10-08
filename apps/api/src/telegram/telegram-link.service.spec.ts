import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramLink } from './telegram-link.entity';
import { ApiException } from '../common/api.exception';

describe('TelegramLinkService', () => {
  let service: TelegramLinkService;
  let repo: jest.Mocked<Repository<TelegramLink>>;

  beforeEach(async () => {
    const repoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramLinkService,
        {
          provide: getRepositoryToken(TelegramLink),
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<TelegramLinkService>(TelegramLinkService);
    repo = module.get(getRepositoryToken(TelegramLink));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('generateLinkCode', () => {
    it('should create a new TelegramLink if none exists for owner', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((dto) => ({ ...dto }) as TelegramLink);
      repo.save.mockImplementation(async (entity) => entity as TelegramLink);

      const result = await service.generateLinkCode('owner-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerId: 'owner-1' } });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'owner-1',
          status: 'pending',
        }),
      );
      expect(result.linkCode).toBeDefined();
      expect(result.linkCode!.length).toBe(6);
      expect(result.linkCodeExpiresAt).toBeInstanceOf(Date);
      expect(result.status).toBe('pending');
    });

    it('should update an existing TelegramLink if one exists', async () => {
      const existing = {
        id: '1',
        ownerId: 'owner-1',
        status: 'unlinked',
        linkCode: null,
        linkCodeExpiresAt: null,
      } as TelegramLink;

      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (entity) => entity as TelegramLink);

      const result = await service.generateLinkCode('owner-1');

      expect(repo.create).not.toHaveBeenCalled();
      expect(result.linkCode).toBeDefined();
      expect(result.linkCode!.length).toBe(6);
      expect(result.status).toBe('pending');
      expect(repo.save).toHaveBeenCalledWith(existing);
    });
  });

  describe('confirmLink', () => {
    it('should throw badRequest if code is empty', async () => {
      await expect(service.confirmLink('', 'chat-123')).rejects.toThrow(
        ApiException.badRequest('Link code is required'),
      );
    });

    it('should throw badRequest if link code is invalid', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.confirmLink('INVALID', 'chat-123')).rejects.toThrow(
        ApiException.badRequest('Invalid link code'),
      );
    });

    it('should throw badRequest if link code is expired', async () => {
      const expiredLink = {
        id: '1',
        ownerId: 'owner-1',
        linkCode: 'EXPIRED',
        linkCodeExpiresAt: new Date(Date.now() - 60 * 1000),
        status: 'pending',
      } as TelegramLink;

      repo.findOne.mockResolvedValue(expiredLink);

      await expect(service.confirmLink('EXPIRED', 'chat-123')).rejects.toThrow(
        ApiException.badRequest('Link code has expired'),
      );
    });

    it('should confirm link successfully and unlink any previous link with same chatId', async () => {
      const pendingLink = {
        id: '1',
        ownerId: 'owner-1',
        linkCode: 'VALID1',
        linkCodeExpiresAt: new Date(Date.now() + 600 * 1000),
        status: 'pending',
        chatId: null,
      } as TelegramLink;

      const previousLinkWithChat = {
        id: '2',
        ownerId: 'owner-2',
        chatId: 'chat-123',
        status: 'linked',
      } as TelegramLink;

      repo.findOne
        .mockResolvedValueOnce(pendingLink) // for linkCode search
        .mockResolvedValueOnce(previousLinkWithChat); // for existing chatId search

      repo.save.mockImplementation(async (entity) => entity as TelegramLink);

      const result = await service.confirmLink('valid1', 'chat-123');

      expect(previousLinkWithChat.status).toBe('unlinked');
      expect(previousLinkWithChat.chatId).toBeNull();
      expect(result.chatId).toBe('chat-123');
      expect(result.status).toBe('linked');
      expect(result.linkedAt).toBeInstanceOf(Date);
      expect(result.linkCode).toBeNull();
      expect(result.linkCodeExpiresAt).toBeNull();
    });
  });

  describe('unlink', () => {
    it('should throw badRequest if neither ownerId nor chatId is provided', async () => {
      await expect(service.unlink()).rejects.toThrow(
        ApiException.badRequest('Owner ID or Chat ID is required'),
      );
    });

    it('should throw notFound if no link matching ownerId or chatId exists', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.unlink('owner-999')).rejects.toThrow(
        ApiException.notFound('Telegram link not found'),
      );
    });

    it('should set status to unlinked and clear chatId and code', async () => {
      const activeLink = {
        id: '1',
        ownerId: 'owner-1',
        chatId: 'chat-123',
        status: 'linked',
        linkCode: null,
        linkCodeExpiresAt: null,
      } as TelegramLink;

      repo.findOne.mockResolvedValue(activeLink);
      repo.save.mockImplementation(async (entity) => entity as TelegramLink);

      const result = await service.unlink('owner-1');

      expect(result.status).toBe('unlinked');
      expect(result.chatId).toBeNull();
      expect(repo.save).toHaveBeenCalledWith(activeLink);
    });
  });

  describe('findByOwner', () => {
    it('should return link row for owner', async () => {
      const link = { id: '1', ownerId: 'owner-1' } as TelegramLink;
      repo.findOne.mockResolvedValue(link);

      const result = await service.findByOwner('owner-1');
      expect(result).toBe(link);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerId: 'owner-1' } });
    });
  });

  describe('findByChatId', () => {
    it('should return active linked row for chatId', async () => {
      const link = { id: '1', chatId: 'chat-123', status: 'linked' } as TelegramLink;
      repo.findOne.mockResolvedValue(link);

      const result = await service.findByChatId('chat-123');
      expect(result).toBe(link);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { chatId: 'chat-123', status: 'linked' },
      });
    });
  });
});

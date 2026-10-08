import { Test, TestingModule } from '@nestjs/testing';
import { TelegramController } from './telegram.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramConfig } from './telegram.config';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('TelegramController', () => {
  let controller: TelegramController;
  let linkService: jest.Mocked<TelegramLinkService>;
  let config: jest.Mocked<TelegramConfig>;

  const mockUser: AuthenticatedUser = {
    userId: 'user-123',
    email: 'user@example.com',
    role: 'user',
  };

  beforeEach(async () => {
    const mockLinkService = {
      generateLinkCode: jest.fn(),
      unlink: jest.fn(),
    };

    const mockConfig = {
      botUsername: 'TestHusrevityBot',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        { provide: TelegramLinkService, useValue: mockLinkService },
        { provide: TelegramConfig, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
    linkService = module.get(TelegramLinkService);
    config = module.get(TelegramConfig);
  });

  describe('generateLinkCode', () => {
    it('should generate a link code and return payload with botUsername and ISO expiresAt', async () => {
      const expires = new Date('2026-09-28T22:00:00.000Z');
      linkService.generateLinkCode.mockResolvedValue({
        id: 'link-1',
        ownerId: 'user-123',
        linkCode: 'A1B2C3',
        linkCodeExpiresAt: expires,
        status: 'pending',
        chatId: null,
        linkedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as any);

      const res = await controller.generateLinkCode(mockUser);

      expect(linkService.generateLinkCode).toHaveBeenCalledWith('user-123');
      expect(res).toEqual({
        code: 'A1B2C3',
        botUsername: 'TestHusrevityBot',
        expiresAt: '2026-09-28T22:00:00.000Z',
      });
    });

    it('should return null for botUsername if botUsername is undefined in config', async () => {
      (config as any).botUsername = undefined;

      const expires = new Date('2026-09-28T22:00:00.000Z');
      linkService.generateLinkCode.mockResolvedValue({
        id: 'link-1',
        ownerId: 'user-123',
        linkCode: 'XYZ987',
        linkCodeExpiresAt: expires,
        status: 'pending',
      } as any);

      const res = await controller.generateLinkCode(mockUser);

      expect(res).toEqual({
        code: 'XYZ987',
        botUsername: null,
        expiresAt: '2026-09-28T22:00:00.000Z',
      });
    });
  });

  describe('unlink', () => {
    it('should call unlink with ownerId', async () => {
      linkService.unlink.mockResolvedValue({} as any);

      await controller.unlink(mockUser);

      expect(linkService.unlink).toHaveBeenCalledWith('user-123');
    });
  });
});

describe('TelegramController status', () => {
  const user: AuthenticatedUser = { userId: 'user-123', email: 'u@example.com', role: 'user' };
  const future = new Date(Date.now() + 5 * 60_000);
  const past = new Date(Date.now() - 5 * 60_000);

  async function build(link: unknown) {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        {
          provide: TelegramLinkService,
          useValue: { findByOwner: jest.fn().mockResolvedValue(link) },
        },
        { provide: TelegramConfig, useValue: { botUsername: 'bot', isConfigured: () => true } },
      ],
    }).compile();
    return module.get<TelegramController>(TelegramController);
  }

  it('should expose an unexpired pending code', async () => {
    const c = await build({
      status: 'pending',
      linkCode: 'ABC123',
      linkCodeExpiresAt: future,
      linkedAt: null,
    });
    await expect(c.status(user)).resolves.toMatchObject({
      linked: false,
      pendingCode: 'ABC123',
      pendingCodeExpiresAt: future.toISOString(),
    });
  });

  it('should hide an expired pending code', async () => {
    const c = await build({
      status: 'pending',
      linkCode: 'ABC123',
      linkCodeExpiresAt: past,
      linkedAt: null,
    });
    await expect(c.status(user)).resolves.toMatchObject({ linked: false, pendingCode: null });
  });

  it('should report linked state and never leak a code', async () => {
    const linkedAt = new Date('2026-09-29T10:00:00Z');
    const c = await build({ status: 'linked', linkCode: null, linkCodeExpiresAt: null, linkedAt });
    await expect(c.status(user)).resolves.toMatchObject({
      configured: true,
      linked: true,
      linkedAt: linkedAt.toISOString(),
      pendingCode: null,
    });
  });

  it('should report unlinked when no row exists', async () => {
    const c = await build(null);
    await expect(c.status(user)).resolves.toMatchObject({
      linked: false,
      pendingCode: null,
      linkedAt: null,
    });
  });
});

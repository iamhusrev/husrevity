import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlackLinkService } from './slack-link.service';
import { SlackLink } from './slack-link.entity';
import { ApiException } from '../common/api.exception';

describe('SlackLinkService', () => {
  let service: SlackLinkService;
  let repo: jest.Mocked<Repository<SlackLink>>;

  beforeEach(async () => {
    const repoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackLinkService,
        {
          provide: getRepositoryToken(SlackLink),
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<SlackLinkService>(SlackLinkService);
    repo = module.get(getRepositoryToken(SlackLink));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('generateLinkCode', () => {
    it('should create a new SlackLink if none exists for owner', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((dto) => ({ ...dto }) as SlackLink);
      repo.save.mockImplementation(async (entity) => entity as SlackLink);

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

    it('should update an existing SlackLink if one exists', async () => {
      const existing = {
        id: '1',
        ownerId: 'owner-1',
        status: 'unlinked',
        linkCode: null,
        linkCodeExpiresAt: null,
      } as SlackLink;

      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (entity) => entity as SlackLink);

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
      await expect(service.confirmLink('', 'U12345')).rejects.toThrow(
        ApiException.badRequest('Link code is required'),
      );
    });

    it('should throw badRequest if link code is invalid', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.confirmLink('INVALID', 'U12345')).rejects.toThrow(
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
      } as SlackLink;

      repo.findOne.mockResolvedValue(expiredLink);

      await expect(service.confirmLink('EXPIRED', 'U12345')).rejects.toThrow(
        ApiException.badRequest('Link code has expired'),
      );
    });

    it('should confirm link successfully and unlink any previous link with same slackUserId', async () => {
      const pendingLink = {
        id: '1',
        ownerId: 'owner-1',
        linkCode: 'VALID1',
        linkCodeExpiresAt: new Date(Date.now() + 600 * 1000),
        status: 'pending',
        slackUserId: null,
      } as SlackLink;

      const previousLinkWithSlackUser = {
        id: '2',
        ownerId: 'owner-2',
        slackUserId: 'U12345',
        status: 'linked',
      } as SlackLink;

      repo.findOne
        .mockResolvedValueOnce(pendingLink) // for linkCode search
        .mockResolvedValueOnce(previousLinkWithSlackUser); // for existing slackUserId search

      repo.save.mockImplementation(async (entity) => entity as SlackLink);

      const result = await service.confirmLink('valid1', 'U12345');

      expect(previousLinkWithSlackUser.status).toBe('unlinked');
      expect(previousLinkWithSlackUser.slackUserId).toBeNull();
      expect(result.slackUserId).toBe('U12345');
      expect(result.status).toBe('linked');
      expect(result.linkedAt).toBeInstanceOf(Date);
      expect(result.linkCode).toBeNull();
      expect(result.linkCodeExpiresAt).toBeNull();
    });
  });

  describe('unlink', () => {
    it('should throw badRequest if neither ownerId nor slackUserId is provided', async () => {
      await expect(service.unlink()).rejects.toThrow(
        ApiException.badRequest('Owner ID or Slack User ID is required'),
      );
    });

    it('should throw notFound if no link matching ownerId or slackUserId exists', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.unlink('owner-999')).rejects.toThrow(
        ApiException.notFound('Slack link not found'),
      );
    });

    it('should set status to unlinked and clear slackUserId and code', async () => {
      const activeLink = {
        id: '1',
        ownerId: 'owner-1',
        slackUserId: 'U12345',
        status: 'linked',
        linkCode: null,
        linkCodeExpiresAt: null,
      } as SlackLink;

      repo.findOne.mockResolvedValue(activeLink);
      repo.save.mockImplementation(async (entity) => entity as SlackLink);

      const result = await service.unlink('owner-1');

      expect(result.status).toBe('unlinked');
      expect(result.slackUserId).toBeNull();
      expect(repo.save).toHaveBeenCalledWith(activeLink);
    });

    it('should unlink by slackUserId when ownerId is not provided', async () => {
      const activeLink = {
        id: '1',
        ownerId: 'owner-1',
        slackUserId: 'U12345',
        status: 'linked',
      } as SlackLink;

      repo.findOne.mockResolvedValue(activeLink);
      repo.save.mockImplementation(async (entity) => entity as SlackLink);

      const result = await service.unlink(undefined, 'U12345');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { slackUserId: 'U12345' } });
      expect(result.status).toBe('unlinked');
      expect(result.slackUserId).toBeNull();
    });
  });

  describe('findByOwner', () => {
    it('should return link row for owner', async () => {
      const link = { id: '1', ownerId: 'owner-1' } as SlackLink;
      repo.findOne.mockResolvedValue(link);

      const result = await service.findByOwner('owner-1');
      expect(result).toBe(link);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerId: 'owner-1' } });
    });
  });

  describe('findBySlackUser', () => {
    it('should return active linked row for slackUserId', async () => {
      const link = { id: '1', slackUserId: 'U12345', status: 'linked' } as SlackLink;
      repo.findOne.mockResolvedValue(link);

      const result = await service.findBySlackUser('U12345');
      expect(result).toBe(link);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { slackUserId: 'U12345', status: 'linked' },
      });
    });
  });
});

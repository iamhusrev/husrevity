import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { NavPreferencesDto, UserDto } from './user.dto';
import { AuthenticatedUser } from '../common/current-user.decorator';

const makeUser = (over: Partial<User> = {}): User =>
  ({
    id: '1',
    email: 'a@b.c',
    passwordHash: 'x',
    firstName: null,
    lastName: null,
    enabled: true,
    emailNotificationsEnabled: false,
    role: 'user',
    navPreferences: null,
    ...over,
  }) as User;

const toDto = (plain: unknown) => plainToInstance(NavPreferencesDto, plain);

describe('NavPreferencesDto (validation)', () => {
  const errorsFor = async (plain: unknown) => validate(toDto(plain));

  it('accepts a valid payload', async () => {
    const errors = await errorsFor({
      sections: { core: ['notes', 'reminders'], daily: ['sport'] },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts empty sections', async () => {
    expect(await errorsFor({ sections: { core: [], daily: [] } })).toHaveLength(0);
  });

  it('rejects an unknown item id', async () => {
    expect(await errorsFor({ sections: { core: ['nope'], daily: [] } })).not.toHaveLength(0);
  });

  it('rejects a missing sections key', async () => {
    expect(await errorsFor({})).not.toHaveLength(0);
  });

  it('rejects a missing daily key', async () => {
    expect(await errorsFor({ sections: { core: [] } })).not.toHaveLength(0);
  });

  it('rejects non-array sections', async () => {
    expect(await errorsFor({ sections: { core: 'notes', daily: [] } })).not.toHaveLength(0);
  });

  it('rejects sections given as an array', async () => {
    expect(await errorsFor({ sections: [] })).not.toHaveLength(0);
    expect(await errorsFor({ sections: [{ core: [], daily: [] }] })).not.toHaveLength(0);
  });

  it('rejects more than 20 entries in a section', async () => {
    const core = Array.from({ length: 21 }, () => 'notes');
    expect(await errorsFor({ sections: { core, daily: [] } })).not.toHaveLength(0);
  });
});

describe('UserService nav preferences', () => {
  let service: UserService;
  let repo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (u: User) => u),
    };
    const module = await Test.createTestingModule({
      providers: [UserService, { provide: getRepositoryToken(User), useValue: repo }],
    }).compile();
    service = module.get(UserService);
  });

  it('stores a valid order', async () => {
    repo.findOne.mockResolvedValue(makeUser());
    const dto = toDto({ sections: { core: ['notes', 'vault'], daily: ['sport', 'inbox'] } });

    const saved = await service.updateNavPreferences('1', dto);

    expect(saved.navPreferences).toEqual({
      sections: { core: ['notes', 'vault'], daily: ['sport', 'inbox'] },
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate id inside one section', async () => {
    repo.findOne.mockResolvedValue(makeUser());
    const dto = toDto({ sections: { core: ['notes', 'notes'], daily: [] } });

    await expect(service.updateNavPreferences('1', dto)).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects the same id in both sections', async () => {
    repo.findOne.mockResolvedValue(makeUser());
    const dto = toDto({ sections: { core: ['notes'], daily: ['notes'] } });

    await expect(service.updateNavPreferences('1', dto)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('throws 404 for an unknown user', async () => {
    repo.findOne.mockResolvedValue(null);
    const dto = toDto({ sections: { core: [], daily: [] } });

    await expect(service.updateNavPreferences('9', dto)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('resets preferences to null', async () => {
    repo.findOne.mockResolvedValue(
      makeUser({ navPreferences: { sections: { core: ['notes'], daily: [] } } }),
    );

    const saved = await service.resetNavPreferences('1');

    expect(saved.navPreferences).toBeNull();
  });
});

describe('UserDto.from', () => {
  it('carries navPreferences', () => {
    const prefs = { sections: { core: ['notes' as const], daily: [] } };
    expect(UserDto.from(makeUser({ navPreferences: prefs })).navPreferences).toEqual(prefs);
  });

  it('exposes null when unset', () => {
    expect(UserDto.from(makeUser()).navPreferences).toBeNull();
  });
});

describe('UserController nav preferences', () => {
  const authUser: AuthenticatedUser = { userId: '1', email: 'a@b.c', role: 'ROLE_USER' };
  let controller: UserController;
  let service: { updateNavPreferences: jest.Mock; resetNavPreferences: jest.Mock };

  beforeEach(async () => {
    service = {
      updateNavPreferences: jest.fn(),
      resetNavPreferences: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: service }],
    }).compile();
    controller = module.get(UserController);
  });

  it('PUT returns the updated UserDto for the caller', async () => {
    const prefs = { sections: { core: ['notes' as const], daily: [] } };
    service.updateNavPreferences.mockResolvedValue(makeUser({ navPreferences: prefs }));

    const result = await controller.updateNavPreferences(authUser, toDto(prefs));

    expect(service.updateNavPreferences).toHaveBeenCalledWith('1', expect.anything());
    expect(result.navPreferences).toEqual(prefs);
  });

  it('DELETE returns the UserDto with navPreferences null', async () => {
    service.resetNavPreferences.mockResolvedValue(makeUser());

    const result = await controller.resetNavPreferences(authUser);

    expect(service.resetNavPreferences).toHaveBeenCalledWith('1');
    expect(result.navPreferences).toBeNull();
  });
});

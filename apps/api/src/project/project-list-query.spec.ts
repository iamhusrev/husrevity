import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectListQueryDto } from './dto/project-list-query.dto';
import { AuthenticatedUser } from '../common/current-user.decorator';

/**
 * GET /projects?filter= used to be a bare @Query('filter') string. The union type is erased at
 * runtime, so a typo like ?filter=Mine reached the SQL and silently returned an empty list.
 */
describe('GET /projects ?filter= query validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const meta = { type: 'query' as const, metatype: ProjectListQueryDto };

  it('is wired to the query DTO on the controller list handler', () => {
    const types: unknown[] =
      Reflect.getMetadata('design:paramtypes', ProjectController.prototype, 'list') ?? [];
    expect(types).toContain(ProjectListQueryDto);
  });

  it.each(['all', 'mine', 'shared'])('accepts and keeps filter=%s', async (filter) => {
    const res = await pipe.transform({ filter }, meta);
    expect(res.filter).toBe(filter);
  });

  it('accepts a missing filter', async () => {
    const res = await pipe.transform({}, meta);
    expect(res.filter).toBeUndefined();
  });

  it.each(['Mine', 'foo', ''])(
    'rejects filter=%j instead of returning an empty list',
    async (filter) => {
      await expect(pipe.transform({ filter }, meta)).rejects.toBeDefined();
    },
  );
});

describe('ProjectController.list', () => {
  let controller: ProjectController;
  let service: { list: jest.Mock };
  const user: AuthenticatedUser = { userId: '1', email: 'owner@example.com', role: 'ROLE_USER' };

  beforeEach(async () => {
    service = { list: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        { provide: ProjectService, useValue: service },
        {
          provide: 'IdempotencyKeyRepository',
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();
    controller = module.get(ProjectController);
  });

  it('passes ?filter=all through to ProjectService.list', async () => {
    await controller.list(user, { filter: 'all' });
    expect(service.list).toHaveBeenCalledWith('1', 'all');
  });

  it('passes undefined when no filter is given', async () => {
    await controller.list(user, {});
    expect(service.list).toHaveBeenCalledWith('1', undefined);
  });
});

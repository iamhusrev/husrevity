import { Test } from '@nestjs/testing';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectResponseDto } from './dto/project-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('ProjectController (restore route)', () => {
  let controller: ProjectController;
  let service: { restore: jest.Mock };

  const user: AuthenticatedUser = { userId: '1', email: 'owner@example.com', role: 'ROLE_USER' };

  beforeEach(async () => {
    service = { restore: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [{ provide: ProjectService, useValue: service }],
    }).compile();

    controller = module.get(ProjectController);
  });

  it('PATCH :code/restore delegates to ProjectService.restore with the current user and route code', async () => {
    const dto = { code: 'ACME' } as ProjectResponseDto;
    service.restore.mockResolvedValue(dto);

    const result = await controller.restore(user, 'ACME');

    expect(service.restore).toHaveBeenCalledWith('1', 'ACME');
    expect(result).toBe(dto);
  });
});

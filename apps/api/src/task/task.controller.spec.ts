import { Test } from '@nestjs/testing';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskResponseDto } from './dto/task-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('TaskController (restore route)', () => {
  let controller: TaskController;
  let service: { restore: jest.Mock };

  const user: AuthenticatedUser = { userId: '1', email: 'owner@example.com', role: 'ROLE_USER' };

  beforeEach(async () => {
    service = { restore: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [{ provide: TaskService, useValue: service }],
    }).compile();

    controller = module.get(TaskController);
  });

  it('PATCH tasks/:id/restore delegates to TaskService.restore with the current user and route id', async () => {
    const dto = { id: '30' } as TaskResponseDto;
    service.restore.mockResolvedValue(dto);

    const result = await controller.restore(user, '30');

    expect(service.restore).toHaveBeenCalledWith('1', '30');
    expect(result).toBe(dto);
  });
});

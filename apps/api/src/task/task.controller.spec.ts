import { Test } from '@nestjs/testing';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskRequestDto, TaskResponseDto } from './dto/task-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('TaskController (restore route)', () => {
  let controller: TaskController;
  let service: { restore: jest.Mock; update: jest.Mock };

  const user: AuthenticatedUser = { userId: '1', email: 'owner@example.com', role: 'ROLE_USER' };

  beforeEach(async () => {
    service = { restore: jest.fn(), update: jest.fn() };

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

  it('PUT tasks/:id delegates to TaskService.update with the current user id, email, route id and body', async () => {
    const dto = { id: '30' } as TaskResponseDto;
    const body = { title: 'Updated', assigneeId: '2' } as TaskRequestDto;
    service.update.mockResolvedValue(dto);

    const result = await controller.update(user, '30', body);

    expect(service.update).toHaveBeenCalledWith('1', 'owner@example.com', '30', body);
    expect(result).toBe(dto);
  });
});

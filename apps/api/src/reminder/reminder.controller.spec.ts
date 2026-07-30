import { Test } from '@nestjs/testing';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { ReminderListResponseDto, ReminderResponseDto } from './dto/reminder-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';

describe('ReminderController (restore routes)', () => {
  let controller: ReminderController;
  let service: { restoreList: jest.Mock; restoreReminder: jest.Mock };

  const user: AuthenticatedUser = { userId: '1', email: 'owner@example.com', role: 'ROLE_USER' };

  beforeEach(async () => {
    service = { restoreList: jest.fn(), restoreReminder: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [ReminderController],
      providers: [{ provide: ReminderService, useValue: service }],
    }).compile();

    controller = module.get(ReminderController);
  });

  it('PATCH reminder-lists/:id/restore delegates to ReminderService.restoreList with the current user and route id', async () => {
    const dto = { id: '5' } as ReminderListResponseDto;
    service.restoreList.mockResolvedValue(dto);

    const result = await controller.restoreList(user, '5');

    expect(service.restoreList).toHaveBeenCalledWith('1', '5');
    expect(result).toBe(dto);
  });

  it('PATCH reminders/:id/restore delegates to ReminderService.restoreReminder with the current user and route id', async () => {
    const dto = { id: '9' } as ReminderResponseDto;
    service.restoreReminder.mockResolvedValue(dto);

    const result = await controller.restore(user, '9');

    expect(service.restoreReminder).toHaveBeenCalledWith('1', '9');
    expect(result).toBe(dto);
  });
});

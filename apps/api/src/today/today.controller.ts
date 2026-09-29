import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { TodayResponseDto } from './dto/today-dtos';
import { TodayService } from './today.service';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('today')
@ApiBearerAuth()
@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  async get(@CurrentUser() u: AuthenticatedUser): Promise<TodayResponseDto> {
    const [dueToday, timeline] = await Promise.all([
      this.today.dueToday(u.userId),
      this.today.timeline(u.userId),
    ]);
    return {
      date: DateTime.now().setZone('Europe/Istanbul').toFormat('yyyy-MM-dd'),
      currentBlock: this.today.currentBlock(timeline),
      timeline,
      dueToday,
      suggestion: null,
    };
  }
}

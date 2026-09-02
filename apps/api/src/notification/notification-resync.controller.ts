import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { NotificationResyncService } from './notification-resync.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationResyncController {
  constructor(private readonly resync: NotificationResyncService) {}

  @Post('resync')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resyncNotifications(@CurrentUser() u: AuthenticatedUser) {
    return this.resync.resyncAll(u.userId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NotificationService } from './notification.service';
import {
  NotificationListQueryDto,
  NotificationResponseDto,
  PushSubscribeDto,
  PushUnsubscribeDto,
  UnreadCountResponseDto,
  VapidPublicKeyResponseDto,
} from './dto/notification-dtos';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationResponseDto[]> {
    return this.notifications.listForOwner(u.userId, query);
  }

  @Get('unread-count')
  async unread(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<UnreadCountResponseDto> {
    return { unread: await this.notifications.unreadCount(u.userId) };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.notifications.markRead(u.userId, id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(u.userId) };
  }

  // ─── Push subscription endpoints ────────────────────────────────────────────

  @Get('vapid-public-key')
  getVapidPublicKey(): VapidPublicKeyResponseDto {
    return { key: this.notifications.getVapidPublicKey() ?? '' };
  }

  /**
   * Throttled because each call writes a push_subscription row; legit clients
   * only call this once per device.
   */
  @Post('push-subscriptions')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribe(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: PushSubscribeDto,
  ): Promise<void> {
    return this.notifications.subscribePush(u.userId, body);
  }

  @Delete('push-subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribe(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: PushUnsubscribeDto,
  ): Promise<void> {
    return this.notifications.unsubscribePush(u.userId, body.endpoint);
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Notification, NotificationKind } from '../notification.entity';

const KINDS: NotificationKind[] = [
  'reminder',
  'task',
  'list_item',
  'calendar_event',
  'time_block',
  'debt',
];

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: KINDS }) kind!: NotificationKind;
  @ApiPropertyOptional() sourceId!: string | null;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() body!: string | null;
  @ApiPropertyOptional() deepLink!: string | null;
  @ApiProperty() scheduledAt!: string;
  @ApiPropertyOptional() dispatchedAt!: string | null;
  @ApiPropertyOptional() readAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      kind: n.kind,
      sourceId: n.sourceId,
      title: n.title,
      body: n.body,
      deepLink: n.deepLink,
      scheduledAt: n.scheduledAt.toISOString(),
      dispatchedAt: n.dispatchedAt ? n.dispatchedAt.toISOString() : null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}

export class NotificationListQueryDto {
  @ApiPropertyOptional({ description: 'If true, returns only unread items' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class PushSubscribeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  endpoint!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  auth!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  userAgent?: string;
}

export class PushUnsubscribeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  endpoint!: string;
}

/**
 * Internal contract every domain module calls to enqueue/cancel its
 * notifications. Not exposed via HTTP.
 */
export interface EnqueueInput {
  ownerId: string;
  kind: NotificationKind;
  sourceId: string;
  scheduledAt: Date;
  title: string;
  body?: string | null;
  deepLink?: string | null;
}

export class VapidPublicKeyResponseDto {
  @ApiProperty() key!: string;
}

export class UnreadCountResponseDto {
  @ApiProperty() unread!: number;
}

export { KINDS as NOTIFICATION_KINDS };
export class _KindGuardDto {
  // Helper for runtime kind validation in DTOs that accept user input.
  @IsIn(KINDS)
  kind!: NotificationKind;
}

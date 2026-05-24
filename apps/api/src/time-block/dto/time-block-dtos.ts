import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { TimeBlock } from '../time-block.entity';

export const TIME_BLOCK_CATEGORIES = [
  'work',
  'focus',
  'rest',
  'exercise',
  'family',
  'other',
] as const;
export type TimeBlockCategory = (typeof TIME_BLOCK_CATEGORIES)[number];

export const TIME_BLOCK_COLOR_TOKENS = [
  'husrev-amber',
  'husrev-ember',
  'husrev-moss',
  'husrev-ink',
  'husrev-sand',
] as const;
export type TimeBlockColorToken = (typeof TIME_BLOCK_COLOR_TOKENS)[number];

export class TimeBlockRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string | null;

  @ApiProperty({ example: '2026-05-20T09:00:00Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-05-20T10:00:00Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ enum: TIME_BLOCK_CATEGORIES })
  @IsOptional()
  @IsIn([...TIME_BLOCK_CATEGORIES])
  category?: TimeBlockCategory | null;

  @ApiPropertyOptional({ enum: TIME_BLOCK_COLOR_TOKENS })
  @IsOptional()
  @IsIn([...TIME_BLOCK_COLOR_TOKENS])
  colorToken?: TimeBlockColorToken | null;

  @ApiPropertyOptional({ description: 'Minutes before startAt to notify' })
  @IsOptional()
  @IsInt()
  notifyMinutesBefore?: number | null;
}

export class TimeBlockResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() notes!: string | null;
  @ApiProperty() startAt!: string;
  @ApiProperty() endAt!: string;
  @ApiPropertyOptional() category!: TimeBlockCategory | null;
  @ApiPropertyOptional() colorToken!: TimeBlockColorToken | null;
  @ApiPropertyOptional() notifyMinutesBefore!: number | null;
  @ApiPropertyOptional() completedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(b: TimeBlock): TimeBlockResponseDto {
    return {
      id: b.id,
      title: b.title,
      notes: b.notes,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      category: (b.category ?? null) as TimeBlockCategory | null,
      colorToken: (b.colorToken ?? null) as TimeBlockColorToken | null,
      notifyMinutesBefore: b.notifyMinutesBefore,
      completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    };
  }
}

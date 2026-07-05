import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SportSession } from '../entities/sport-session.entity';

export const ACTIVITY_TYPES = [
  'RUNNING',
  'YOGA',
  'SWIMMING',
  'STRENGTH',
  'GYM',
  'CYCLING',
  'FOOTBALL',
  'CUSTOM',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const SESSION_LOCATIONS = ['EV', 'SALON', 'YÜZME', 'DIS'] as const;
export type SessionLocation = (typeof SESSION_LOCATIONS)[number];

export const SESSION_DIFFICULTIES = ['EASY', 'MODERATE', 'HARD'] as const;
export type SessionDifficulty = (typeof SESSION_DIFFICULTIES)[number];

export class SessionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programId?: string;

  @ApiProperty({ enum: ACTIVITY_TYPES })
  @IsIn(ACTIVITY_TYPES)
  activityType!: ActivityType;

  @ApiProperty({ enum: SESSION_LOCATIONS })
  @IsIn(SESSION_LOCATIONS)
  location!: SessionLocation;

  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  plannedDayOfWeek!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  plannedDuration!: number;

  @ApiProperty({ enum: SESSION_DIFFICULTIES })
  @IsIn(SESSION_DIFFICULTIES)
  difficulty!: SessionDifficulty;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description!: string;
}

export class SessionUpdateRequestDto {
  // Note: no `programId` here on purpose — a session's parent program is
  // immutable once created (mirrors how `task.projectId` IS mutable but
  // sport sessions intentionally are not, per product spec).
  @ApiPropertyOptional({ enum: ACTIVITY_TYPES })
  @IsOptional()
  @IsIn(ACTIVITY_TYPES)
  activityType?: ActivityType;

  @ApiPropertyOptional({ enum: SESSION_LOCATIONS })
  @IsOptional()
  @IsIn(SESSION_LOCATIONS)
  location?: SessionLocation;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  plannedDayOfWeek?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  plannedDuration?: number;

  @ApiPropertyOptional({ enum: SESSION_DIFFICULTIES })
  @IsOptional()
  @IsIn(SESSION_DIFFICULTIES)
  difficulty?: SessionDifficulty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class SessionResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() programId!: string | null;
  @ApiProperty({ enum: ACTIVITY_TYPES }) activityType!: ActivityType;
  @ApiProperty({ enum: SESSION_LOCATIONS }) location!: SessionLocation;
  @ApiProperty() name!: string;
  @ApiProperty() plannedDayOfWeek!: number;
  @ApiProperty() plannedDuration!: number;
  @ApiProperty({ enum: SESSION_DIFFICULTIES }) difficulty!: SessionDifficulty;
  @ApiProperty() description!: string;
  @ApiProperty() position!: number;
  @ApiProperty() createdAt!: Date;

  static from(s: SportSession): SessionResponseDto {
    return {
      id: s.id,
      programId: s.programId,
      activityType: s.activityType as ActivityType,
      location: s.location as SessionLocation,
      name: s.name,
      plannedDayOfWeek: s.plannedDayOfWeek,
      plannedDuration: s.plannedDuration,
      difficulty: s.difficulty as SessionDifficulty,
      description: s.description,
      position: s.position,
      createdAt: s.createdAt,
    };
  }
}

export class SessionReorderItemDto {
  @IsNotEmpty()
  id!: string;

  @IsInt()
  @Min(0)
  position!: number;
}

export class ReorderSessionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SessionReorderItemDto)
  items!: SessionReorderItemDto[];
}

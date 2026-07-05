import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RoutineSegment } from '../routine-segment.entity';
import { RoutineActivity } from '../routine-activity.entity';

export const ROUTINE_COLOR_TOKENS = [
  'husrev-amber',
  'husrev-ember',
  'husrev-moss',
  'husrev-ink',
  'husrev-sand',
] as const;
export type RoutineColorToken = (typeof ROUTINE_COLOR_TOKENS)[number];

const MAX_MINUTE = 24 * 60 - 1; // 1439

export class SegmentRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Minutes from midnight (0–1439); null = open start' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MINUTE)
  startMinute?: number | null;

  @ApiPropertyOptional({ description: 'Minutes from midnight (0–1439); null = open end' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MINUTE)
  endMinute?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(60)
  theme?: string | null;

  @ApiPropertyOptional({ enum: ROUTINE_COLOR_TOKENS })
  @IsOptional()
  @IsIn([...ROUTINE_COLOR_TOKENS])
  colorToken?: RoutineColorToken | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(127)
  daysOfWeek?: number;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string | null;
}

export class ActivityRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;
}

export class ActivityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() segmentId!: string;
  @ApiProperty() text!: string;
  @ApiProperty() position!: number;

  static from(a: RoutineActivity): ActivityResponseDto {
    return {
      id: a.id,
      segmentId: a.segmentId,
      text: a.text,
      position: a.position,
    };
  }
}

export class SegmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() startMinute!: number | null;
  @ApiPropertyOptional() endMinute!: number | null;
  @ApiPropertyOptional() theme!: string | null;
  @ApiPropertyOptional() colorToken!: RoutineColorToken | null;
  @ApiProperty() daysOfWeek!: number;
  @ApiPropertyOptional() notes!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [ActivityResponseDto] }) activities!: ActivityResponseDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(s: RoutineSegment, activities: RoutineActivity[]): SegmentResponseDto {
    return {
      id: s.id,
      name: s.name,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      theme: s.theme,
      colorToken: (s.colorToken ?? null) as RoutineColorToken | null,
      daysOfWeek: s.daysOfWeek,
      notes: s.notes,
      position: s.position,
      activities: activities.map(ActivityResponseDto.from),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}

export class RoutineReorderItemDto {
  @IsNotEmpty()
  id!: string;

  @IsInt()
  position!: number;
}

export class RoutineReorderRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoutineReorderItemDto)
  items!: RoutineReorderItemDto[];
}

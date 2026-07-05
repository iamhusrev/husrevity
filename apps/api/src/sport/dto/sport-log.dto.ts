import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SportLog } from '../entities/sport-log.entity';

export class LogRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string | null;

  @ApiProperty()
  @IsDateString()
  executedDate!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  actualDuration!: number;

  @ApiProperty()
  @IsBoolean()
  completed!: boolean;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  intensity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  caloriesBurned?: number | null;
}

export class LogUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  executedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  actualDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  intensity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  caloriesBurned?: number | null;
}

export class LogResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() sessionId!: string | null;
  @ApiProperty() executedDate!: string;
  @ApiProperty() actualDuration!: number;
  @ApiProperty() completed!: boolean;
  @ApiProperty() intensity!: number;
  @ApiPropertyOptional() notes!: string | null;
  @ApiPropertyOptional() caloriesBurned!: number | null;
  @ApiProperty() createdAt!: Date;

  static from(l: SportLog): LogResponseDto {
    return {
      id: l.id,
      sessionId: l.sessionId,
      executedDate: l.executedDate,
      actualDuration: l.actualDuration,
      completed: l.completed,
      intensity: l.intensity,
      notes: l.notes,
      caloriesBurned: l.caloriesBurned,
      createdAt: l.createdAt,
    };
  }
}

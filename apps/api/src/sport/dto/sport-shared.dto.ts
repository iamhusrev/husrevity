import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateAiProgramDto {
  @ApiProperty({ minimum: 4, maximum: 16 })
  @IsInt()
  @Min(4)
  @Max(16)
  weekCount!: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  activityPreferences!: string[];

  @ApiProperty({ minimum: 1, maximum: 168 })
  @IsInt()
  @Min(1)
  @Max(168)
  targetWeeklyHours!: number;
}

export class WeeklyTrendEntryDto {
  @ApiProperty() weekStart!: string;
  @ApiProperty() hoursCompleted!: number;
}

export class SportStatsDto {
  @ApiProperty() totalCompleted!: number;
  @ApiProperty() avgDuration!: number;
  @ApiProperty() totalHours!: number;
  /** activityType -> count of completed logs whose session has that activity type */
  @ApiProperty({ type: Object }) activityBreakdown!: Record<string, number>;
  /** intensity (1-10, as string key) -> count of completed logs at that intensity */
  @ApiProperty({ type: Object }) intensityDist!: Record<string, number>;
  @ApiProperty({ type: [WeeklyTrendEntryDto] })
  weeklyTrend!: WeeklyTrendEntryDto[];
}

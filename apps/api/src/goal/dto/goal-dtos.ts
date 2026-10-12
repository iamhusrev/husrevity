import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { DateTime } from 'luxon';
import { Goal, GoalHorizon, GoalStatus } from '../goal.entity';
import { isValidNumericId } from '../../common/numeric-id.pipe';

export const GOAL_HORIZONS: GoalHorizon[] = ['year', 'quarter', 'month'];
export const GOAL_STATUSES: GoalStatus[] = ['active', 'done', 'dropped'];

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isRealIsoDate(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  if (!ISO_DATE_REGEX.test(s)) return false;
  const dt = DateTime.fromISO(s, { zone: 'utc' });
  return dt.isValid && dt.toISODate() === s;
}

export function IsRealIsoDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isRealIsoDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null) return true;
          return isRealIsoDate(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be formatted YYYY-MM-DD and represent a valid calendar date`;
        },
      },
    });
  };
}

export function IsNullableNumericId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isNullableNumericId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null) return true;
          return isValidNumericId(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be null or a numeric ID (1-19 digits)`;
        },
      },
    });
  };
}

export class GoalProgressDto {
  @ApiProperty({ description: 'Total non-cancelled items linked directly or via projects' })
  total!: number;

  @ApiProperty({ description: 'Completed items' })
  done!: number;

  @ApiProperty({ description: 'Open items' })
  open!: number;

  @ApiProperty({ description: 'Completion percentage (0-100)' })
  percent!: number;
}

export class GoalRequestDto {
  @ApiProperty({ maxLength: 200 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiProperty({ enum: GOAL_HORIZONS })
  @IsIn(GOAL_HORIZONS)
  horizon!: GoalHorizon;

  @ApiProperty({ example: '2026-01-01' })
  @IsNotEmpty()
  @IsRealIsoDate({ message: 'periodStart must be formatted YYYY-MM-DD' })
  periodStart!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsNotEmpty()
  @IsRealIsoDate({ message: 'periodEnd must be formatted YYYY-MM-DD' })
  periodEnd!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNullableNumericId({ message: 'parentGoalId must be null or a numeric ID (1-19 digits)' })
  parentGoalId?: string | null;

  @ApiPropertyOptional({ enum: GOAL_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(GOAL_STATUSES)
  status?: GoalStatus;
}

export class GoalUpdateRequestDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ enum: GOAL_HORIZONS })
  @IsOptional()
  @IsIn(GOAL_HORIZONS)
  horizon?: GoalHorizon;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsRealIsoDate({ message: 'periodStart must be formatted YYYY-MM-DD' })
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsRealIsoDate({ message: 'periodEnd must be formatted YYYY-MM-DD' })
  periodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNullableNumericId({ message: 'parentGoalId must be null or a numeric ID (1-19 digits)' })
  parentGoalId?: string | null;

  @ApiPropertyOptional({ enum: GOAL_STATUSES })
  @IsOptional()
  @IsIn(GOAL_STATUSES)
  status?: GoalStatus;
}

export class GoalListQueryDto {
  @ApiPropertyOptional({ enum: GOAL_HORIZONS })
  @IsOptional()
  @IsIn(GOAL_HORIZONS)
  horizon?: GoalHorizon;

  @ApiPropertyOptional({ enum: GOAL_STATUSES })
  @IsOptional()
  @IsIn(GOAL_STATUSES)
  status?: GoalStatus;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsRealIsoDate({ message: 'from must be formatted YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsRealIsoDate({ message: 'to must be formatted YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class GoalResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() notes!: string | null;
  @ApiProperty({ enum: GOAL_HORIZONS }) horizon!: GoalHorizon;
  @ApiProperty() periodStart!: string;
  @ApiProperty() periodEnd!: string;
  @ApiPropertyOptional() parentGoalId!: string | null;
  @ApiProperty({ enum: GOAL_STATUSES }) status!: GoalStatus;
  @ApiProperty({ type: GoalProgressDto }) progress!: GoalProgressDto;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(goal: Goal, progress: GoalProgressDto): GoalResponseDto {
    return {
      id: goal.id,
      ownerId: goal.ownerId,
      title: goal.title,
      notes: goal.notes ?? null,
      horizon: goal.horizon,
      periodStart: typeof goal.periodStart === 'string' ? goal.periodStart : new Date(goal.periodStart).toISOString().slice(0, 10),
      periodEnd: typeof goal.periodEnd === 'string' ? goal.periodEnd : new Date(goal.periodEnd).toISOString().slice(0, 10),
      parentGoalId: goal.parentGoalId ?? null,
      status: goal.status,
      progress,
      createdAt: goal.createdAt ? new Date(goal.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: goal.updatedAt ? new Date(goal.updatedAt).toISOString() : new Date().toISOString(),
    };
  }
}

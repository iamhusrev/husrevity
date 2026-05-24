import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { Plan } from '../plan.entity';
import { PlanItem } from '../plan-item.entity';

export class PlanRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @MaxLength(32)
  status?: string;
}

export class PlanResponseDto {
  id!: string;
  title!: string;
  description!: string | null;
  targetDate!: string | null;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;

  static from(p: Plan): PlanResponseDto {
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      targetDate: p.targetDate,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

export class PlanItemRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class PlanItemResponseDto {
  id!: string;
  planId!: string;
  title!: string;
  done!: boolean;
  targetDate!: string | null;
  orderIndex!: number;

  static from(i: PlanItem): PlanItemResponseDto {
    return {
      id: i.id,
      planId: i.planId,
      title: i.title,
      done: i.done,
      targetDate: i.targetDate,
      orderIndex: i.orderIndex,
    };
  }
}

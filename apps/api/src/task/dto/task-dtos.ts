import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Task } from '../task.entity';

export class TaskRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @MaxLength(32)
  priority?: string;

  @IsOptional()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /** Notification lead-time in minutes; null disables. 0 = at dueAt exactly. */
  @IsOptional()
  @IsInt()
  notifyMinutesBefore?: number | null;
}

export class TaskResponseDto {
  id!: string;
  projectId!: string | null;
  title!: string;
  description!: string | null;
  status!: string;
  priority!: string;
  dueAt!: Date | null;
  position!: number;
  notifyMinutesBefore!: number | null;
  createdAt!: Date;
  updatedAt!: Date;

  static from(t: Task): TaskResponseDto {
    return {
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
      position: t.position,
      notifyMinutesBefore: t.notifyMinutesBefore,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}

export class ReorderItemDto {
  @IsNotEmpty()
  id!: string;

  @IsInt()
  position!: number;
}

export class ReorderRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

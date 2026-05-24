import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReminderList } from '../reminder-list.entity';
import { Reminder } from '../reminder.entity';

export class ReminderListRequestDto {
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @MaxLength(32)
  icon?: string;
}

export class ReminderListResponseDto {
  id!: string;
  name!: string;
  color!: string;
  icon!: string | null;
  position!: number;
  itemCount!: number;
  createdAt!: Date;

  static from(l: ReminderList, itemCount: number): ReminderListResponseDto {
    return {
      id: l.id,
      name: l.name,
      color: l.color,
      icon: l.icon,
      position: l.position,
      itemCount,
      createdAt: l.createdAt,
    };
  }
}

export class ReminderRequestDto {
  @IsOptional()
  listId?: string;

  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @MaxLength(16)
  priority?: string;

  @IsOptional()
  @IsBoolean()
  flag?: boolean;

  /** Notification lead-time in minutes; null disables. 0 = at dueAt exactly. */
  @IsOptional()
  @IsInt()
  notifyMinutesBefore?: number | null;
}

export class ReminderResponseDto {
  id!: string;
  listId!: string | null;
  title!: string;
  notes!: string | null;
  dueAt!: Date | null;
  completedAt!: Date | null;
  priority!: string;
  flag!: boolean;
  position!: number;
  notifyMinutesBefore!: number | null;
  createdAt!: Date;
  updatedAt!: Date;

  static from(r: Reminder): ReminderResponseDto {
    return {
      id: r.id,
      listId: r.listId,
      title: r.title,
      notes: r.notes,
      dueAt: r.dueAt,
      completedAt: r.completedAt,
      priority: r.priority,
      flag: r.flag,
      position: r.position,
      notifyMinutesBefore: r.notifyMinutesBefore,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
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

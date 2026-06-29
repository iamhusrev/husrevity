import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TodoList } from '../todo-list.entity';
import { ListItem } from '../list-item.entity';
import { ListSection } from '../list-section.entity';

export class ListRequestDto {
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @MaxLength(32)
  icon?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ListResponseDto {
  id!: string;
  name!: string;
  color!: string | null;
  icon!: string | null;
  archived!: boolean;
  position!: number;
  createdAt!: Date;
  updatedAt!: Date;

  static from(l: TodoList): ListResponseDto {
    return {
      id: l.id,
      name: l.name,
      color: l.color,
      icon: l.icon,
      archived: l.archived,
      position: l.position,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }
}

export class SectionRequestDto {
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;
}

export class SectionResponseDto {
  id!: string;
  listId!: string;
  name!: string;
  position!: number;
  createdAt!: Date;
  updatedAt!: Date;

  static from(s: ListSection): SectionResponseDto {
    return {
      id: s.id,
      listId: s.listId,
      name: s.name,
      position: s.position,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}

export class ItemRequestDto {
  @IsNotEmpty()
  @MaxLength(512)
  text!: string;

  /** Group this item under a section; null/omitted = ungrouped. */
  @IsOptional()
  @IsString()
  sectionId?: string | null;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsInt()
  position?: number;

  /** Notification lead-time in minutes; null disables. 0 = at dueAt exactly. */
  @IsOptional()
  @IsInt()
  notifyMinutesBefore?: number | null;
}

export class ItemResponseDto {
  id!: string;
  listId!: string;
  sectionId!: string | null;
  text!: string;
  done!: boolean;
  dueAt!: Date | null;
  position!: number;
  notifyMinutesBefore!: number | null;
  createdAt!: Date;
  updatedAt!: Date;

  static from(i: ListItem): ItemResponseDto {
    return {
      id: i.id,
      listId: i.listId,
      sectionId: i.sectionId,
      text: i.text,
      done: i.done,
      dueAt: i.dueAt,
      position: i.position,
      notifyMinutesBefore: i.notifyMinutesBefore,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
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

import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Note } from '../note.entity';
import { NoteTag } from '../note-tag.entity';

export class TagRequestDto {
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @MaxLength(16)
  color?: string;
}

export class TagDto {
  id!: string;
  name!: string;
  color!: string | null;

  static from(t: NoteTag): TagDto {
    return { id: t.id, name: t.name, color: t.color };
  }
}

export class NoteRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  bodyMarkdown?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsArray()
  tagIds?: string[];

  @IsOptional()
  @MaxLength(16)
  colorHex?: string;
}

export class NoteResponseDto {
  id!: string;
  title!: string;
  bodyMarkdown!: string | null;
  pinned!: boolean;
  archived!: boolean;
  position!: number;
  colorHex!: string | null;
  tags!: TagDto[];
  createdAt!: Date;
  updatedAt!: Date;

  static from(n: Note): NoteResponseDto {
    return {
      id: n.id,
      title: n.title,
      bodyMarkdown: n.bodyMarkdown,
      pinned: n.pinned,
      archived: n.archived,
      position: n.position,
      colorHex: n.colorHex,
      tags: (n.tags ?? []).map(TagDto.from),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
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

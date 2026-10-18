import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Fixed allow-list of soft-deleted kinds the trash exposes. The order is also
 * the tie-break order of the merged listing (see TrashService), so append new
 * kinds at the end rather than reordering.
 */
export const TRASH_KINDS = [
  'task',
  'project',
  'reminder',
  'reminder_list',
  'calendar_event',
  'goal',
] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

export const TRASH_DEFAULT_LIMIT = 20;
export const TRASH_MAX_LIMIT = 100;
export const TRASH_MAX_CURSOR_LENGTH = 512;

export class TrashListQueryDto {
  @ApiPropertyOptional({
    description: 'Kinds to include; repeatable (?kind=task&kind=goal). Defaults to all kinds.',
    enum: TRASH_KINDS,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsIn(TRASH_KINDS, { each: true })
  kind?: TrashKind[];

  @ApiPropertyOptional({
    description: 'Only entries deleted at or after this instant (ISO 8601 date-time).',
    format: 'date-time',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  since?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: TRASH_MAX_LIMIT, default: TRASH_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TRASH_MAX_LIMIT)
  limit?: number = TRASH_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: 'Opaque paging cursor from a previous response (nextCursor).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRASH_MAX_CURSOR_LENGTH)
  cursor?: string;
}

export class DeletedEntryDto {
  @ApiProperty({ enum: TRASH_KINDS })
  kind!: TrashKind;

  @ApiProperty({ description: 'Numeric id of the deleted row (bigint as string)' })
  id!: string;

  @ApiProperty({ description: 'Title or name of the deleted row; never its body or notes' })
  title!: string;

  @ApiProperty({ format: 'date-time' })
  deletedAt!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Set for tasks that belong to a project' })
  projectId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Live name of that project' })
  projectName?: string | null;

  @ApiProperty({
    nullable: true,
    description: 'MCP tool that restores this entry',
    example: 'restore_task',
  })
  restoreTool!: string | null;

  @ApiProperty({
    description: 'REST route that restores this entry (method PATCH)',
    example: '/tasks/12/restore',
  })
  restorePath!: string;
}

export class TrashListResponseDto {
  @ApiProperty({ type: [DeletedEntryDto] })
  items!: DeletedEntryDto[];

  @ApiProperty({
    nullable: true,
    description: 'Pass as ?cursor= to fetch the next page; null on the last page',
  })
  nextCursor!: string | null;
}

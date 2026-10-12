import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import {
  ChangeSetSource,
  ChangeSetStatus,
} from '../entities/change-set.entity';
import {
  ChangeEntryOp,
  ChangeEntryTargetType,
} from '../entities/change-entry.entity';

export class ChangeSetListQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor: change set ID to fetch older records before' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'before must be a numeric string' })
  before?: string;
}

export class ChangeSetSummaryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() source!: ChangeSetSource;
  @ApiProperty() label!: string;
  @ApiProperty() status!: ChangeSetStatus;
  @ApiProperty() createdAt!: string;
  @ApiProperty() entryCount!: number;
}

export class ChangeEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() ordinal!: number;
  @ApiProperty() targetType!: ChangeEntryTargetType;
  @ApiProperty() targetId!: string;
  @ApiProperty() op!: ChangeEntryOp;
  @ApiPropertyOptional() before!: Record<string, unknown> | null;
  @ApiPropertyOptional() after!: Record<string, unknown> | null;
}

export class ChangeSetDetailResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() source!: ChangeSetSource;
  @ApiProperty() label!: string;
  @ApiProperty() status!: ChangeSetStatus;
  @ApiPropertyOptional() undoneAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [ChangeEntryResponseDto] }) entries!: ChangeEntryResponseDto[];
}

export class UndoConflictDto {
  @ApiProperty() targetType!: ChangeEntryTargetType;
  @ApiProperty() targetId!: string;
  @ApiProperty() reason!: string;
}

export class UndoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: ChangeSetStatus;
  @ApiProperty() undoneEntries!: number;
  @ApiProperty({ type: [UndoConflictDto] }) conflicts!: UndoConflictDto[];
}

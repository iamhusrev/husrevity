import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SportProgram } from '../entities/sport-program.entity';
import { SessionResponseDto } from './sport-session.dto';

export const PROGRAM_TYPES = ['WEEKLY', 'MONTHLY'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export class ProgramRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ minimum: 4, maximum: 52 })
  @IsInt()
  @Min(4)
  @Max(52)
  weekCount!: number;

  @ApiProperty({ enum: PROGRAM_TYPES })
  @IsIn(PROGRAM_TYPES)
  programType!: ProgramType;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;
}

export class ProgramUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ minimum: 4, maximum: 52 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(52)
  weekCount?: number;

  @ApiPropertyOptional({ enum: PROGRAM_TYPES })
  @IsOptional()
  @IsIn(PROGRAM_TYPES)
  programType?: ProgramType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;
}

export class ProgramResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() weekCount!: number;
  @ApiProperty({ enum: PROGRAM_TYPES }) programType!: ProgramType;
  @ApiProperty() aiGenerated!: boolean;
  @ApiProperty() startDate!: string;
  @ApiPropertyOptional() endDate!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [SessionResponseDto] }) sessions!: SessionResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional() deletedAt!: Date | null;

  static from(p: SportProgram, sessions: SessionResponseDto[] = []): ProgramResponseDto {
    return {
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      description: p.description,
      weekCount: p.weekCount,
      programType: p.programType as ProgramType,
      aiGenerated: p.aiGenerated,
      startDate: p.startDate,
      endDate: p.endDate,
      isActive: p.isActive,
      sessions,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      deletedAt: p.deletedAt,
    };
  }
}

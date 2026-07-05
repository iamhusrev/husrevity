import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';
import { Project } from '../project.entity';

export class ProjectRequestDto {
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Za-zçÇğĞıİöÖşŞüÜ0-9_-]+$/, {
    message: 'code must be alphanumeric (including Turkish), dash, underscore',
  })
  code!: string;

  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ProjectUpdateRequestDto {
  @IsOptional()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ProjectResponseDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  status!: string;
  startDate!: string | null;
  endDate!: string | null;
  @ApiProperty() pinned!: boolean;
  @ApiProperty() archived!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static from(p: Project): ProjectResponseDto {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      pinned: p.pinned,
      archived: p.archived,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

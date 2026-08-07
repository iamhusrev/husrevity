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
import { ProjectRole } from '../project-member.entity';

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
  ownerId!: string;
  ownerName!: string | null;
  @ApiProperty() role!: ProjectRole;
  @ApiProperty() shared!: boolean;
  @ApiProperty() memberCount!: number;

  static from(
    p: Project,
    ctx?: { role?: ProjectRole; memberCount?: number; ownerName?: string | null },
  ): ProjectResponseDto {
    const role = ctx?.role ?? 'OWNER';
    const memberCount = ctx?.memberCount ?? 1;
    const ownerName = ctx?.ownerName ?? null;
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
      ownerId: p.ownerId,
      ownerName,
      role,
      shared: memberCount > 1,
      memberCount,
    };
  }
}

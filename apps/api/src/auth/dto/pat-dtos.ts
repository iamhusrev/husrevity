import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { PatScope, PersonalAccessToken } from '../personal-access-token.entity';

export const PAT_SCOPES: PatScope[] = [
  'items:read',
  'items:write',
  'notes:read',
  'notes:write',
  'projects:read',
  'projects:write',
];

export class IssuePatRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: PAT_SCOPES, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(PAT_SCOPES, { each: true })
  scopes!: PatScope[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class IssuedPatResponseDto {
  @ApiProperty() id!: string;
  /** Shown exactly once — not recoverable afterward (only the hash is stored). */
  @ApiProperty() token!: string;
}

export class PatResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PAT_SCOPES, isArray: true }) scopes!: PatScope[];
  @ApiPropertyOptional() lastUsedAt!: string | null;
  @ApiPropertyOptional() expiresAt!: string | null;
  @ApiProperty() createdAt!: string;

  static from(p: PersonalAccessToken): PatResponseDto {
    return {
      id: p.id,
      name: p.name,
      scopes: p.scopes,
      lastUsedAt: p.lastUsedAt ? p.lastUsedAt.toISOString() : null,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

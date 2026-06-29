import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReadingTrack } from '../reading-track.entity';
import { ReadingLog } from '../reading-log.entity';

export const READING_COLOR_TOKENS = [
  'husrev-amber',
  'husrev-ember',
  'husrev-moss',
  'husrev-ink',
  'husrev-sand',
] as const;
export type ReadingColorToken = (typeof READING_COLOR_TOKENS)[number];

export class TrackRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: READING_COLOR_TOKENS })
  @IsOptional()
  @IsIn([...READING_COLOR_TOKENS])
  colorToken?: ReadingColorToken | null;

  @ApiPropertyOptional({ description: 'Show a "Dinlenildi" toggle alongside "Okundu"' })
  @IsOptional()
  @IsBoolean()
  tracksListened?: boolean;

  @ApiPropertyOptional({ description: 'Daily goal hint, e.g. "10 sayfa"' })
  @IsOptional()
  @MaxLength(120)
  dailyTarget?: string | null;
}

export class TrackResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() colorToken!: ReadingColorToken | null;
  @ApiProperty() tracksListened!: boolean;
  @ApiPropertyOptional() dailyTarget!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(t: ReadingTrack): TrackResponseDto {
    return {
      id: t.id,
      name: t.name,
      colorToken: (t.colorToken ?? null) as ReadingColorToken | null,
      tracksListened: t.tracksListened,
      dailyTarget: t.dailyTarget,
      position: t.position,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}

export class LogRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(120)
  pageRange?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  read?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  listened?: boolean;
}

export class LogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() trackId!: string;
  @ApiProperty() logDate!: string;
  @ApiPropertyOptional() pageRange!: string | null;
  @ApiProperty() read!: boolean;
  @ApiProperty() listened!: boolean;

  static from(l: ReadingLog): LogResponseDto {
    return {
      id: l.id,
      trackId: l.trackId,
      logDate: l.logDate,
      pageRange: l.pageRange,
      read: l.read,
      listened: l.listened,
    };
  }
}

export class ReadingReorderItemDto {
  @IsNotEmpty()
  id!: string;

  @IsInt()
  position!: number;
}

export class ReadingReorderRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReadingReorderItemDto)
  items!: ReadingReorderItemDto[];
}

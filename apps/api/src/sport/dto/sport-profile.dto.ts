import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SportProfile } from '../entities/sport-profile.entity';

export const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export class ProfileRequestDto {
  @ApiPropertyOptional({ enum: FITNESS_LEVELS })
  @IsOptional()
  @IsIn(FITNESS_LEVELS)
  fitnessLevel?: FitnessLevel;

  @ApiPropertyOptional({ minimum: 1, maximum: 168 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  weeklyHours?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredActivities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goals?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ProfileResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FITNESS_LEVELS }) fitnessLevel!: FitnessLevel;
  @ApiProperty() weeklyHours!: number;
  @ApiProperty({ type: [String] }) preferredActivities!: string[];
  @ApiPropertyOptional() goals!: string | null;
  @ApiPropertyOptional() notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(p: SportProfile): ProfileResponseDto {
    return {
      id: p.id,
      fitnessLevel: (p.fitnessLevel ?? 'beginner') as FitnessLevel,
      weeklyHours: p.weeklyHours,
      preferredActivities: p.preferredActivities ?? [],
      goals: p.goals,
      notes: p.notes,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

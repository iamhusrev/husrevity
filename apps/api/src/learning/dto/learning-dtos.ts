import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsUrl, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LearningItem } from '../learning-item.entity';
import { LearningTopic } from '../learning-topic.entity';

export class TopicRequestDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiPropertyOptional() @IsOptional() description?: string | null;
}

export class ItemRequestDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(300) text!: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(512) @IsUrl({}, { message: 'url must be a valid URL' }) url?: string | null;
  @ApiPropertyOptional() @IsOptional() notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) estimatedMinutes?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() reviewAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() notifyMinutesBefore?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() position?: number;
}

export class ItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() topicId!: string;
  @ApiProperty() text!: string;
  @ApiPropertyOptional() url!: string | null;
  @ApiPropertyOptional() notes!: string | null;
  @ApiPropertyOptional() estimatedMinutes!: number | null;
  @ApiPropertyOptional() reviewAt!: string | null;
  @ApiPropertyOptional() notifyMinutesBefore!: number | null;
  @ApiPropertyOptional() completedAt!: string | null;
  @ApiProperty() position!: number;

  static from(i: LearningItem): ItemResponseDto {
    return { id: i.id, topicId: i.topicId, text: i.text, url: i.url, notes: i.notes,
      estimatedMinutes: i.estimatedMinutes, reviewAt: i.reviewAt?.toISOString() ?? null,
      notifyMinutesBefore: i.notifyMinutesBefore, completedAt: i.completedAt?.toISOString() ?? null,
      position: i.position };
  }
}

export class TopicResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [ItemResponseDto] }) items!: ItemResponseDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(t: LearningTopic, items: LearningItem[]): TopicResponseDto {
    return { id: t.id, title: t.title, description: t.description, position: t.position,
      items: items.map(ItemResponseDto.from), itemCount: items.length,
      completedCount: items.filter((i) => i.completedAt !== null).length,
      createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() };
  }
}

export class LearningReorderItemDto { @IsNotEmpty() id!: string; @IsInt() position!: number; }
export class LearningReorderRequestDto {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => LearningReorderItemDto)
  items!: LearningReorderItemDto[];
}

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsUrl, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LearningItem } from '../learning-item.entity';
import { LearningSubtopic } from '../learning-subtopic.entity';
import { LearningTopic } from '../learning-topic.entity';

export class TopicRequestDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiPropertyOptional() @IsOptional() description?: string | null;
}

export class SubtopicRequestDto {
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
  @ApiPropertyOptional() @IsOptional() subtopicId?: string | null;
}

export class ItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() topicId!: string;
  @ApiPropertyOptional() subtopicId!: string | null;
  @ApiProperty() text!: string;
  @ApiPropertyOptional() url!: string | null;
  @ApiPropertyOptional() notes!: string | null;
  @ApiPropertyOptional() estimatedMinutes!: number | null;
  @ApiPropertyOptional() reviewAt!: string | null;
  @ApiPropertyOptional() notifyMinutesBefore!: number | null;
  @ApiPropertyOptional() completedAt!: string | null;
  @ApiProperty() position!: number;

  static from(i: LearningItem): ItemResponseDto {
    return { id: i.id, topicId: i.topicId, subtopicId: i.subtopicId, text: i.text, url: i.url, notes: i.notes,
      estimatedMinutes: i.estimatedMinutes, reviewAt: i.reviewAt?.toISOString() ?? null,
      notifyMinutesBefore: i.notifyMinutesBefore, completedAt: i.completedAt?.toISOString() ?? null,
      position: i.position };
  }
}

export class SubtopicResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() topicId!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [ItemResponseDto] }) items!: ItemResponseDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(s: LearningSubtopic, items: LearningItem[]): SubtopicResponseDto {
    return { id: s.id, topicId: s.topicId, title: s.title, description: s.description, position: s.position,
      items: items.map(ItemResponseDto.from), itemCount: items.length,
      completedCount: items.filter((i) => i.completedAt !== null).length,
      createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
  }
}

export class TopicResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [ItemResponseDto] }) items!: ItemResponseDto[];
  @ApiProperty({ type: [SubtopicResponseDto] }) subtopics!: SubtopicResponseDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(t: LearningTopic, directItems: LearningItem[], subtopics: SubtopicResponseDto[]): TopicResponseDto {
    return { id: t.id, title: t.title, description: t.description, position: t.position,
      items: directItems.map(ItemResponseDto.from), subtopics,
      itemCount: directItems.length + subtopics.reduce((count, subtopic) => count + subtopic.itemCount, 0),
      completedCount: directItems.filter((i) => i.completedAt !== null).length + subtopics.reduce((count, subtopic) => count + subtopic.completedCount, 0),
      createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() };
  }
}

export class LearningReorderItemDto { @IsNotEmpty() id!: string; @IsInt() position!: number; }
export class LearningReorderRequestDto {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => LearningReorderItemDto)
  items!: LearningReorderItemDto[];
}

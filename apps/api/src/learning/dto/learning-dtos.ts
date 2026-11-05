import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LearningItem } from '../learning-item.entity';
import { LearningSubtopic } from '../learning-subtopic.entity';
import { LearningTopic } from '../learning-topic.entity';

const istanbulYear = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
});

/** Calendar year of `date` in Europe/Istanbul (the owner's wall clock). */
export function yearInIstanbul(date: Date | string): number {
  return Number(istanbulYear.format(date instanceof Date ? date : new Date(date)));
}

export class TopicRequestDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiPropertyOptional() @IsOptional() description?: string | null;
  /** Omit to leave untouched on update; send null to fall back to the createdAt year. */
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 2000, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number | null;
}

export class SubtopicRequestDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiPropertyOptional() @IsOptional() description?: string | null;
}

export class ItemRequestDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(300) text!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(512)
  @IsUrl({}, { message: 'url must be a valid URL' })
  url?: string | null;
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
  @ApiProperty() updatedAt!: string;

  static from(i: LearningItem): ItemResponseDto {
    return {
      id: i.id,
      topicId: i.topicId,
      subtopicId: i.subtopicId,
      text: i.text,
      url: i.url,
      notes: i.notes,
      estimatedMinutes: i.estimatedMinutes,
      reviewAt: i.reviewAt?.toISOString() ?? null,
      notifyMinutesBefore: i.notifyMinutesBefore,
      completedAt: i.completedAt?.toISOString() ?? null,
      position: i.position,
      updatedAt: i.updatedAt?.toISOString(),
    };
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
    return {
      id: s.id,
      topicId: s.topicId,
      title: s.title,
      description: s.description,
      position: s.position,
      items: items.map(ItemResponseDto.from),
      itemCount: items.length,
      completedCount: items.filter((i) => i.completedAt !== null).length,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}

export class TopicResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() position!: number;
  /** Always resolved: the stored year, else the year of createdAt in Europe/Istanbul. */
  @ApiProperty() year!: number;
  @ApiProperty({ type: [ItemResponseDto] }) items!: ItemResponseDto[];
  @ApiProperty({ type: [SubtopicResponseDto] }) subtopics!: SubtopicResponseDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static from(
    t: LearningTopic,
    directItems: LearningItem[],
    subtopics: SubtopicResponseDto[],
  ): TopicResponseDto {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      position: t.position,
      year: t.year ?? yearInIstanbul(t.createdAt),
      items: directItems.map(ItemResponseDto.from),
      subtopics,
      itemCount:
        directItems.length + subtopics.reduce((count, subtopic) => count + subtopic.itemCount, 0),
      completedCount:
        directItems.filter((i) => i.completedAt !== null).length +
        subtopics.reduce((count, subtopic) => count + subtopic.completedCount, 0),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}

/** Full ordered id list of one parent's children (topic, subtopic or item list). */
export class LearningReorderRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  orderedIds!: string[];
}

export class TopicReorderRequestDto extends LearningReorderRequestDto {
  /** When set, `orderedIds` is the full list of that year only; other years keep their slots. */
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class MoveItemRequestDto {
  /** Target subtopic of the same topic, or null for the topic's direct item list. */
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  subtopicId!: string | null;
  /** Zero-based index in the target list; values past the end append. */
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) index!: number;
}

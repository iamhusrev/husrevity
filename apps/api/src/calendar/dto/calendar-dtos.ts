import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { CalendarEvent } from '../calendar-event.entity';

export class EventRequestDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  description?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @MaxLength(16)
  colorHex?: string;

  @IsOptional()
  @IsInt()
  reminderMinutes?: number;

  @IsOptional()
  @MaxLength(512)
  recurrenceRule?: string;
}

export class EventResponseDto {
  id!: string;
  title!: string;
  description!: string | null;
  startAt!: Date;
  endAt!: Date;
  allDay!: boolean;
  location!: string | null;
  colorHex!: string | null;
  reminderMinutes!: number | null;
  recurrenceRule!: string | null;

  static from(e: CalendarEvent): EventResponseDto {
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      startAt: e.startAt,
      endAt: e.endAt,
      allDay: e.allDay,
      location: e.location,
      colorHex: e.colorHex,
      reminderMinutes: e.reminderMinutes,
      recurrenceRule: e.recurrenceRule,
    };
  }
}

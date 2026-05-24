import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('calendar_event')
@Index('idx_calendar_event_owner', ['ownerId'])
@Index('idx_calendar_event_owner_range', ['ownerId', 'startAt', 'endAt'])
export class CalendarEvent extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Column({ name: 'all_day', type: 'boolean', default: false })
  allDay!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ name: 'color_hex', type: 'varchar', length: 16, nullable: true })
  colorHex!: string | null;

  @Column({ name: 'reminder_minutes', type: 'integer', nullable: true })
  reminderMinutes!: number | null;

  @Column({ name: 'recurrence_rule', type: 'varchar', length: 512, nullable: true })
  recurrenceRule!: string | null;
}

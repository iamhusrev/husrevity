import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Minimised read copy of a Google event. Deliberately NO description,
 * attendees or location. All-day events use `startDate` / `endDateExclusive`
 * (plain 'YYYY-MM-DD' strings, Google's own exclusive end) and leave the
 * instants null; timed events do the opposite.
 */
@Entity('google_calendar_event')
export class GoogleCalendarEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'subscription_id', type: 'bigint' })
  subscriptionId!: string;

  @Column({ type: 'int' })
  generation!: number;

  @Column({ name: 'google_event_id', type: 'varchar', length: 1024 })
  googleEventId!: string;

  @Column({ name: 'recurring_event_id', type: 'varchar', length: 1024, nullable: true })
  recurringEventId!: string | null;

  @Column({ name: 'original_start_at', type: 'timestamptz', nullable: true })
  originalStartAt!: Date | null;

  @Column({ name: 'original_start_date', type: 'date', nullable: true })
  originalStartDate!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'confirmed' })
  status!: 'confirmed' | 'tentative';

  @Column({ type: 'varchar', length: 255, default: '' })
  title!: string;

  @Column({ name: 'all_day', type: 'boolean' })
  allDay!: boolean;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt!: Date | null;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date_exclusive', type: 'date', nullable: true })
  endDateExclusive!: string | null;

  @Column({ name: 'html_link', type: 'text', nullable: true })
  htmlLink!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  etag!: string | null;

  @Column({ name: 'google_updated_at', type: 'timestamptz', nullable: true })
  googleUpdatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

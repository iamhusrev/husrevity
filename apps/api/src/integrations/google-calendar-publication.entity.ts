import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Item -> Google event idempotency map for the optional write path (slice 10). */
@Entity('google_calendar_publication')
export class GoogleCalendarPublication {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'item_id', type: 'bigint' })
  itemId!: string;

  @Column({ name: 'subscription_id', type: 'bigint' })
  subscriptionId!: string;

  @Column({ name: 'google_event_id', type: 'varchar', length: 1024 })
  googleEventId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  etag!: string | null;

  /** Set when the Google copy must be removed; the publish job deletes the event and then this row. */
  @Column({ name: 'delete_pending_at', type: 'timestamptz', nullable: true })
  deletePendingAt!: Date | null;

  @Column({ name: 'delete_attempts', type: 'int', default: 0 })
  deleteAttempts!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

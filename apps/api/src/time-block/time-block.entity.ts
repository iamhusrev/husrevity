import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

/**
 * Evkat — a daily time-block planner row. Each block is a single
 * contiguous span on the user's day (`startAt`–`endAt`) with optional
 * category, color token, and lead-time notification.
 *
 * Distinct from `calendar_event`: time blocks are intent-laden ("how do I
 * spend this hour?") and live on the Evkat page; calendar events are
 * "what's happening?" — sometimes external, often shared. Both can coexist
 * for the same user without semantic overlap.
 */
@Entity('time_block')
@Index('idx_time_block_owner_start', ['ownerId', 'startAt'])
export class TimeBlock extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  /**
   * 'work' | 'focus' | 'rest' | 'exercise' | 'family' | 'other' — soft enum,
   * controller validates the string but the column stays free-form to keep
   * future categories migration-free.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  category!: string | null;

  /**
   * Husrev token name (e.g. `husrev-amber`) — gives the user a way to
   * override the auto-assigned category color in the day view.
   */
  @Column({ name: 'color_token', type: 'varchar', length: 24, nullable: true })
  colorToken!: string | null;

  /** Notification lead-time in minutes; null disables. */
  @Column({ name: 'notify_minutes_before', type: 'integer', nullable: true })
  notifyMinutesBefore!: number | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}

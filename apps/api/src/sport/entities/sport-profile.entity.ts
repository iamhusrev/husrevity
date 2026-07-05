import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/**
 * Per-user sport preferences: fitness level, weekly hour target, preferred
 * activities and free-text goals/notes (allergies, injuries, equipment).
 * One row per owner, created lazily by the sport service.
 */
@Entity('sport_profile')
@Index('idx_sport_profile_owner', ['ownerId'])
export class SportProfile extends BaseEntity {
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId!: string;

  @Column({ name: 'fitness_level', type: 'varchar', length: 50, default: 'beginner' })
  fitnessLevel!: string; // 'beginner' | 'intermediate' | 'advanced'

  @Column({ name: 'weekly_hours', type: 'int', default: 5 })
  weeklyHours!: number; // target weekly hours

  @Column({ name: 'preferred_activities', type: 'jsonb', default: '[]' })
  preferredActivities!: string[]; // ['running', 'yoga', etc]

  @Column({ type: 'text', nullable: true })
  goals!: string | null; // user's fitness goals

  @Column({ type: 'text', nullable: true })
  notes!: string | null; // allergies, injuries, equipment
}

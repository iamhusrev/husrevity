import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
} from 'typeorm';

/**
 * Mirrors Spring's BaseEntity (com.husrevity.common.BaseEntity).
 * - id: bigserial PK
 * - createdAt/updatedAt: managed by TypeORM (@CreateDateColumn / @UpdateDateColumn)
 * - createdById/updatedById: populated by AuditSubscriber from AsyncLocalStorage
 * - deletedAt: soft-delete (NULL = live row). Default queries exclude soft-deleted via TypeORM.
 *
 * In Spring this was @MappedSuperclass + @CreatedBy/@LastModifiedBy via AuditorAware.
 * Here it's a TS abstract class + entity subscriber. See common/audit.subscriber.ts.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by_id', type: 'bigint', nullable: true })
  updatedById!: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

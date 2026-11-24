import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Link between a user and an external identity. The permanent key is the
 * provider's subject id (`sub` for Google), never the e-mail address. A plain
 * entity (no audit/soft-delete columns): unlinking deletes the row.
 */
@Entity('user_identity')
export class UserIdentity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'provider_subject', type: 'varchar', length: 255 })
  providerSubject!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

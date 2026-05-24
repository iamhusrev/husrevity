import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../common/base.entity';

@Entity('app_user')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 160, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 80, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 80, nullable: true })
  lastName!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /**
   * When true (and the API has SMTP configured), the notification dispatcher
   * sends an email for every notification it fans out via web-push. Default
   * false — opt-in to avoid existing users getting unexpected mail.
   */
  @Column({
    name: 'email_notifications_enabled',
    type: 'boolean',
    default: false,
  })
  emailNotificationsEnabled!: boolean;

  /**
   * 'user' | 'admin'. Single role per user — see migration
   * `UserRolesAndInvites1715000012000`. Promoting another user to admin is an
   * admin-only action via `/api/admin/users/:id`.
   */
  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: string;
}

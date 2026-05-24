import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Brackets,
  DataSource,
  ILike,
  IsNull,
  LessThan,
  Repository,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { User } from '../user/user.entity';
import { ApiException } from '../common/api.exception';
import { MailerService } from '../notification/mailer.service';
import { AuthService } from '../auth/auth.service';
import { AuthResponseDto } from '../auth/dto/auth-dtos';
import { UserInvite } from './user-invite.entity';
import {
  AcceptInviteDto,
  AdminResetPasswordDto,
  AdminUpdateUserDto,
  AdminUserDto,
  AdminUserListQueryDto,
  AdminUserListResponseDto,
  CreateInviteDto,
  CreatedInviteDto,
  InviteLookupDto,
  InviteResponseDto,
  Role,
} from './dto/admin-dtos';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserInvite)
    private readonly invites: Repository<UserInvite>,
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ─── Users ───────────────────────────────────────────────────────────────

  async listUsers(
    q: AdminUserListQueryDto,
  ): Promise<AdminUserListResponseDto> {
    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;
    const qb = this.users.createQueryBuilder('u').where('1 = 1');
    if (q.search) {
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('LOWER(u.email) LIKE :s', {
              s: `%${q.search!.toLowerCase()}%`,
            })
            .orWhere('LOWER(u.first_name) LIKE :s', {
              s: `%${q.search!.toLowerCase()}%`,
            })
            .orWhere('LOWER(u.last_name) LIKE :s', {
              s: `%${q.search!.toLowerCase()}%`,
            }),
        ),
      );
    }
    qb.orderBy('u.created_at', 'DESC').limit(limit).offset(offset);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map(AdminUserDto.from),
      total,
    };
  }

  async getUser(id: string): Promise<AdminUserDto> {
    return AdminUserDto.from(await this.requireUser(id));
  }

  async updateUser(
    actingAdminId: string,
    id: string,
    dto: AdminUpdateUserDto,
  ): Promise<AdminUserDto> {
    const u = await this.requireUser(id);
    if (dto.firstName !== undefined) u.firstName = dto.firstName ?? null;
    if (dto.lastName !== undefined) u.lastName = dto.lastName ?? null;
    if (dto.enabled !== undefined) {
      if (id === actingAdminId && dto.enabled === false) {
        throw ApiException.badRequest('You cannot disable yourself');
      }
      u.enabled = dto.enabled;
    }
    if (dto.role !== undefined) {
      if (id === actingAdminId && dto.role !== 'admin') {
        throw ApiException.badRequest('You cannot demote yourself');
      }
      u.role = dto.role;
    }
    return AdminUserDto.from(await this.users.save(u));
  }

  async resetPassword(id: string, dto: AdminResetPasswordDto): Promise<void> {
    const u = await this.requireUser(id);
    u.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.users.save(u);
    // All existing sessions of the target user get revoked next time their
    // access token expires (refresh-then-rotate flow on the user side). For
    // an immediate kill we'd revoke RefreshTokens too — left as V2.
  }

  async deleteUser(actingAdminId: string, id: string): Promise<void> {
    if (id === actingAdminId) {
      throw ApiException.badRequest('You cannot delete yourself');
    }
    const u = await this.requireUser(id);
    await this.users.softRemove(u);
  }

  // ─── Invites — admin side ────────────────────────────────────────────────

  async listInvites(): Promise<InviteResponseDto[]> {
    const rows = await this.invites.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map(InviteResponseDto.from);
  }

  async createInvite(
    adminId: string,
    adminEmail: string,
    dto: CreateInviteDto,
  ): Promise<CreatedInviteDto> {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.users.findOne({ where: { email } });
    if (existingUser) {
      throw ApiException.conflict('A user with this email already exists');
    }
    // If a live (non-accepted, non-expired) invite exists for this email,
    // delete it before creating a new one so we don't accumulate noise.
    const now = new Date();
    const stale = await this.invites.find({
      where: { email, acceptedAt: IsNull() },
    });
    if (stale.length > 0) {
      await this.invites.softRemove(stale);
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = new Date(
      now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const invite = this.invites.create({
      invitedById: adminId,
      email,
      tokenHash,
      role: dto.role ?? 'user',
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      expiresAt,
      acceptedAt: null,
      acceptedUserId: null,
    });
    const saved = await this.invites.save(invite);

    const inviteUrl = this.buildInviteUrl(token);
    let emailDelivered = false;
    if (this.mailer.isConfigured()) {
      emailDelivered = await this.mailer.sendInviteEmail(
        email,
        inviteUrl,
        adminEmail,
        dto.firstName ?? null,
        expiresAt,
      );
    } else {
      this.logger.warn(
        `Invite created but mailer not configured — admin must share the URL manually: ${inviteUrl}`,
      );
    }

    return {
      ...InviteResponseDto.from(saved),
      inviteUrl,
      emailDelivered,
    };
  }

  async revokeInvite(id: string): Promise<void> {
    const inv = await this.invites.findOne({ where: { id } });
    if (!inv) throw ApiException.notFound('Invite not found');
    if (inv.acceptedAt) {
      throw ApiException.badRequest('Invite already accepted');
    }
    await this.invites.softRemove(inv);
  }

  // ─── Invites — public acceptance ─────────────────────────────────────────

  async lookupInvite(token: string): Promise<InviteLookupDto> {
    const inv = await this.requireLiveInvite(token);
    const inviter = await this.users.findOne({
      where: { id: inv.invitedById },
    });
    return {
      email: inv.email,
      firstName: inv.firstName,
      lastName: inv.lastName,
      expiresAt: inv.expiresAt.toISOString(),
      invitedByEmail: inviter?.email ?? '—',
    };
  }

  async acceptInvite(
    token: string,
    dto: AcceptInviteDto,
  ): Promise<AuthResponseDto> {
    const inv = await this.requireLiveInvite(token);
    // Race: another user may have signed up with this email between invite
    // creation and acceptance (e.g. via /auth/register). Treat as conflict.
    const collision = await this.users.findOne({
      where: { email: inv.email },
    });
    if (collision) {
      throw ApiException.conflict('Email is already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await this.dataSource.transaction(async (em) => {
      const user = em.create(User, {
        email: inv.email,
        passwordHash,
        firstName: dto.firstName ?? inv.firstName ?? null,
        lastName: dto.lastName ?? inv.lastName ?? null,
        enabled: true,
        emailNotificationsEnabled: false,
        role: inv.role,
      });
      const savedUser = await em.save(user);
      inv.acceptedAt = new Date();
      inv.acceptedUserId = savedUser.id;
      await em.save(inv);
      return savedUser;
    });
    // Issue tokens just like /auth/login would.
    return this.auth.issueTokensFor(result);
  }

  // ─── Maintenance ─────────────────────────────────────────────────────────

  /** Daily cleanup of expired, unaccepted invites. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'invite-cleanup' })
  async cleanupExpiredInvites(): Promise<void> {
    const cutoff = new Date();
    const rows = await this.invites.find({
      where: {
        acceptedAt: IsNull(),
        expiresAt: LessThan(cutoff),
      },
    });
    if (rows.length === 0) return;
    await this.invites.softRemove(rows);
    this.logger.log(`Cleaned up ${rows.length} expired invite(s)`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async requireUser(id: string): Promise<User> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw ApiException.notFound('User not found');
    return u;
  }

  private async requireLiveInvite(token: string): Promise<UserInvite> {
    const inv = await this.invites.findOne({
      where: { tokenHash: sha256(token) },
    });
    if (!inv) throw ApiException.notFound('Invite not found');
    if (inv.acceptedAt)
      throw ApiException.badRequest('Invite already accepted');
    if (inv.expiresAt.getTime() < Date.now()) {
      throw ApiException.badRequest('Invite expired');
    }
    return inv;
  }

  private buildInviteUrl(token: string): string {
    const base = (
      this.config.get<string>('HUSREVITY_WEB_URL') ?? 'http://localhost:3090'
    ).replace(/\/+$/, '');
    return `${base}/invite/${token}`;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

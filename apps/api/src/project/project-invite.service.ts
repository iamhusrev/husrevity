import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Project } from './project.entity';
import { ProjectMember, ProjectRole } from './project-member.entity';
import { ProjectInvite } from './project-invite.entity';
import { User } from '../user/user.entity';
import { ApiException } from '../common/api.exception';
import { MailerService } from '../notification/mailer.service';
import {
  AcceptProjectInviteResponseDto,
  ProjectInviteLookupDto,
  RegisterViaProjectInviteDto,
} from './dto/project-invite-dtos';
import { ProjectInviteResponseDto } from './dto/project-member-dtos';

const PROJECT_INVITE_TTL_DAYS = 7;

/**
 * Token-based invites for project collaboration — mirrors admin/admin.service.ts's
 * user-onboarding invite flow, but scoped to a single project and to
 * EDITOR/VIEWER roles only (OWNER can never be granted this way).
 *
 * This service deliberately never depends on AuthService (see the module-cycle
 * note in auth/project-invite-register.controller.ts) — it creates User /
 * ProjectMember rows but never mints JWTs. Token minting for the
 * brand-new-account flow is the caller's job, from AuthModule.
 */
@Injectable()
export class ProjectInviteService {
  private readonly logger = new Logger(ProjectInviteService.name);

  constructor(
    @InjectRepository(ProjectInvite) private readonly invites: Repository<ProjectInvite>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates (or replaces a stale one for the same project+email) a token
   * invite. Called by ProjectMemberService when the invitee has no account
   * yet. Returns the plaintext inviteUrl + whether the email was delivered.
   */
  async createInvite(
    projectId: string,
    invitedById: string,
    invitedByEmail: string,
    email: string,
    role: ProjectRole,
  ): Promise<{ invite: ProjectInvite; inviteUrl: string; emailDelivered: boolean }> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) throw ApiException.notFound('Project not found');

    // Live (unaccepted) invite for the same project+email gets replaced
    // rather than accumulating duplicates.
    const stale = await this.invites.find({
      where: { projectId, email, acceptedAt: IsNull() },
    });
    if (stale.length > 0) {
      await this.invites.softRemove(stale);
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + PROJECT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = this.invites.create({
      projectId,
      invitedById,
      email,
      tokenHash,
      role,
      expiresAt,
      acceptedAt: null,
      acceptedUserId: null,
    });
    const saved = await this.invites.save(invite);

    const inviteUrl = this.buildInviteUrl(token);
    let emailDelivered = false;
    if (this.mailer.isConfigured()) {
      emailDelivered = await this.mailer.sendProjectInviteEmail(
        email,
        project.name,
        invitedByEmail,
        inviteUrl,
        role,
        expiresAt,
      );
    } else {
      this.logger.warn(
        `Project invite created but mailer not configured — share the URL manually: ${inviteUrl}`,
      );
    }

    return { invite: saved, inviteUrl, emailDelivered };
  }

  /** Live (unaccepted, unexpired) invites only, newest first. */
  async listForProject(projectId: string): Promise<ProjectInviteResponseDto[]> {
    const rows = await this.invites.find({
      where: { projectId, acceptedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return rows.map(ProjectInviteResponseDto.from);
  }

  async revoke(projectId: string, inviteId: string): Promise<void> {
    const invite = await this.invites.findOne({ where: { id: inviteId, projectId } });
    if (!invite) throw ApiException.notFound('Invite not found');
    if (invite.acceptedAt) throw ApiException.badRequest('Invite already accepted');
    await this.invites.softRemove(invite);
  }

  async lookup(token: string): Promise<ProjectInviteLookupDto> {
    const invite = await this.requireLiveInvite(token);
    const project = await this.projects.findOne({ where: { id: invite.projectId } });
    if (!project) throw ApiException.notFound('Project not found');
    const [inviter, existingUser] = await Promise.all([
      this.users.findOne({ where: { id: invite.invitedById } }),
      this.users.findOne({ where: { email: invite.email } }),
    ]);
    return {
      projectName: project.name,
      projectCode: project.code,
      email: invite.email,
      role: invite.role,
      invitedByEmail: inviter?.email ?? '—',
      expiresAt: invite.expiresAt.toISOString(),
      requiresRegistration: !existingUser,
    };
  }

  /**
   * Authenticated existing-user acceptance. Requires userEmail matches the
   * invite email (case-insensitive) or throws forbidden.
   */
  async acceptForExistingUser(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<AcceptProjectInviteResponseDto> {
    const invite = await this.requireLiveInvite(token);
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw ApiException.forbidden('This invite was sent to a different email address');
    }

    const existingMember = await this.members.findOne({
      where: { projectId: invite.projectId, userId },
    });
    if (existingMember) {
      // Re-clicking an old link while already a live member — no-op success.
      return { projectId: invite.projectId, role: existingMember.role };
    }

    await this.dataSource.transaction(async (em) => {
      await this.upsertMemberRow(em, invite.projectId, userId, invite.role, invite.invitedById);
      invite.acceptedAt = new Date();
      invite.acceptedUserId = userId;
      await em.save(invite);
    });

    return { projectId: invite.projectId, role: invite.role };
  }

  /**
   * Creates a brand-new User for the invite's email + a ProjectMember row,
   * marks the invite accepted. Does NOT mint tokens — caller (in AuthModule)
   * does that.
   */
  async registerAndCreateMember(
    token: string,
    dto: RegisterViaProjectInviteDto,
  ): Promise<User> {
    const invite = await this.requireLiveInvite(token);
    // Race: another user may have signed up with this email between invite
    // creation and acceptance. Treat as conflict, same pattern as
    // AdminService.acceptInvite.
    const collision = await this.users.findOne({ where: { email: invite.email } });
    if (collision) {
      throw ApiException.conflict(
        'An account with this email already exists — log in and accept the invite instead',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.dataSource.transaction(async (em) => {
      const user = em.create(User, {
        email: invite.email,
        passwordHash,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        enabled: true,
        emailNotificationsEnabled: false,
        role: 'user',
      });
      const savedUser = await em.save(user);
      await this.upsertMemberRow(em, invite.projectId, savedUser.id, invite.role, invite.invitedById);
      invite.acceptedAt = new Date();
      invite.acceptedUserId = savedUser.id;
      await em.save(invite);
      return savedUser;
    });
  }

  /**
   * Called from AuthService.register() right after a new user is saved.
   * Activates every live invite for that email across ALL projects —
   * inserts/restores a ProjectMember row per invite and marks each accepted.
   * Must never throw in a way that blocks registration — the caller wraps
   * this in try/catch, but we still keep going across invites so one bad
   * row doesn't stop the rest.
   */
  async activatePendingForUser(userId: string, email: string): Promise<void> {
    const liveInvites = await this.invites.find({
      where: { email, acceptedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    for (const invite of liveInvites) {
      try {
        await this.dataSource.transaction(async (em) => {
          const existingMember = await em
            .getRepository(ProjectMember)
            .findOne({ where: { projectId: invite.projectId, userId } });
          if (!existingMember) {
            await this.upsertMemberRow(em, invite.projectId, userId, invite.role, invite.invitedById);
          }
          invite.acceptedAt = new Date();
          invite.acceptedUserId = userId;
          await em.save(invite);
        });
      } catch (e) {
        this.logger.warn(
          `Failed to activate project invite ${invite.id} for user ${userId}: ${(e as Error).message}`,
        );
      }
    }
  }

  /** Daily cleanup of expired, unaccepted project invites. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'project-invite-cleanup' })
  async cleanupExpiredInvites(): Promise<void> {
    const rows = await this.invites.find({
      where: { acceptedAt: IsNull(), expiresAt: LessThan(new Date()) },
    });
    if (rows.length === 0) return;
    await this.invites.softRemove(rows);
    this.logger.log(`Cleaned up ${rows.length} expired project invite(s)`);
  }

  /** Public so ProjectMemberService can build a project link with the same base URL, without duplicating the config lookup. */
  buildProjectUrl(projectId: string): string {
    return `${this.webBase()}/projects/${projectId}`;
  }

  private buildInviteUrl(token: string): string {
    return `${this.webBase()}/project-invite/${token}`;
  }

  private webBase(): string {
    return (this.config.get<string>('HUSREVITY_WEB_URL') ?? 'http://localhost:3090').replace(
      /\/+$/,
      '',
    );
  }

  private async requireLiveInvite(token: string): Promise<ProjectInvite> {
    const invite = await this.invites.findOne({ where: { tokenHash: sha256(token) } });
    if (!invite) throw ApiException.notFound('Invite not found');
    if (invite.acceptedAt) throw ApiException.badRequest('Invite already accepted');
    if (invite.expiresAt.getTime() < Date.now()) throw ApiException.badRequest('Invite expired');
    return invite;
  }

  /** Shared insert-or-restore-soft-deleted logic, used by acceptForExistingUser/registerAndCreateMember/activatePendingForUser. */
  private async upsertMemberRow(
    em: EntityManager,
    projectId: string,
    userId: string,
    role: ProjectRole,
    invitedById: string,
  ): Promise<void> {
    const repo = em.getRepository(ProjectMember);
    const existing = await repo.findOne({ where: { projectId, userId }, withDeleted: true });
    if (existing) {
      if (existing.deletedAt) {
        existing.deletedAt = null;
        existing.role = role;
        existing.invitedById = invitedById;
        existing.joinedAt = new Date();
        await repo.save(existing);
      }
      // Already a live member — nothing to do.
      return;
    }
    const member = repo.create({ projectId, userId, role, invitedById, joinedAt: new Date() });
    await repo.save(member);
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

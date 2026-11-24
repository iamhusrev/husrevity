import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Project } from '../../project/project.entity';
import { ProjectMember } from '../../project/project-member.entity';
import { ProjectInvite } from '../../project/project-invite.entity';
import { ProjectInviteService } from '../../project/project-invite.service';
import { MailerService } from '../../notification/mailer.service';
import { User } from '../../user/user.entity';
import { RefreshToken } from '../refresh-token.entity';
import { AuthService } from '../auth.service';
import {
  MigrationHarness,
  startMigrationHarness,
} from '../../db/migrations/__tests__/helpers/migration-harness';

/**
 * Real-Postgres regression tests for the project-invite bypass: an open
 * (unverified) registration must never join the registrant to a project just
 * because a live invite exists for that email. Joining stays token-gated.
 * Runs against a disposable testcontainer only.
 */
jest.setTimeout(180_000);

describe('open registration vs project invites (integration)', () => {
  let h: MigrationHarness;
  let ds: DataSource;
  let auth: AuthService;
  let invites: ProjectInviteService;
  let ownerId: string;
  let seq = 0;

  const tokenFrom = (inviteUrl: string): string => inviteUrl.split('/project-invite/')[1];

  const createProject = async (): Promise<string> => {
    const [project] = await ds.query(
      `INSERT INTO project (owner_id, code, name) VALUES ($1, $2, 'P') RETURNING id`,
      [ownerId, `P${++seq}`],
    );
    await ds.query(
      `INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [project.id, ownerId],
    );
    return project.id;
  };

  const createInvite = async (projectId: string, email: string, role: 'EDITOR' | 'VIEWER') => {
    const { inviteUrl } = await invites.createInvite(
      projectId,
      ownerId,
      'owner@example.com',
      email,
      role,
    );
    return tokenFrom(inviteUrl);
  };

  const memberRows = (projectId: string, userId: string) =>
    ds.query(`SELECT role FROM project_member WHERE project_id = $1 AND user_id = $2`, [
      projectId,
      userId,
    ]);

  beforeAll(async () => {
    h = await startMigrationHarness();
    await h.migrateUpTo();
    ds = new DataSource({
      type: 'postgres',
      url: h.container.getConnectionUri(),
      entities: [User, RefreshToken, Project, ProjectMember, ProjectInvite],
      synchronize: false,
    });
    await ds.initialize();

    const config = {
      get: (key: string) => (key === 'HUSREVITY_WEB_URL' ? 'http://web.test' : undefined),
    };
    const mailer = { isConfigured: () => false } as unknown as MailerService;
    invites = new ProjectInviteService(
      ds.getRepository(ProjectInvite),
      ds.getRepository(ProjectMember),
      ds.getRepository(Project),
      ds.getRepository(User),
      ds,
      mailer,
      config as unknown as ConfigService,
    );
    auth = new AuthService(
      ds.getRepository(User),
      ds.getRepository(RefreshToken),
      { signAsync: async () => 'access-token' } as unknown as JwtService,
      config as unknown as ConfigService,
      ds,
    );

    const [owner] = await ds.query(
      `INSERT INTO app_user (email, password_hash) VALUES ('owner@example.com', 'x') RETURNING id`,
    );
    ownerId = owner.id;
  });

  afterAll(async () => {
    await ds?.destroy();
    await h?.close();
  });

  it('open_register_does_not_join_invited_project', async () => {
    const projectId = await createProject();
    const email = 'open-invitee@example.com';
    await createInvite(projectId, email, 'EDITOR');

    const res = await auth.register({ email, password: 'Password123!' });

    expect(await memberRows(projectId, res.user.id)).toEqual([]);
    const [invite] = await ds.query(
      `SELECT accepted_at, accepted_user_id FROM project_invite WHERE email = $1`,
      [email],
    );
    expect(invite).toEqual({ accepted_at: null, accepted_user_id: null });
  });

  it('openly_registered_invitee_accepts_with_token', async () => {
    const projectId = await createProject();
    const email = 'token-invitee@example.com';
    const token = await createInvite(projectId, email, 'VIEWER');
    const res = await auth.register({ email, password: 'Password123!' });

    const accepted = await invites.acceptForExistingUser(token, res.user.id, email);

    expect(accepted).toEqual({ projectId, role: 'VIEWER' });
    expect(await memberRows(projectId, res.user.id)).toEqual([{ role: 'VIEWER' }]);
    const [invite] = await ds.query(
      `SELECT accepted_user_id FROM project_invite WHERE email = $1`,
      [email],
    );
    expect(invite.accepted_user_id).toBe(res.user.id);
  });

  it('invite_register_flow_unchanged', async () => {
    const projectId = await createProject();
    const email = 'link-invitee@example.com';
    const token = await createInvite(projectId, email, 'EDITOR');

    const user = await invites.registerAndCreateMember(token, {
      password: 'Password123!',
    } as never);

    expect(user.email).toBe(email);
    expect(await memberRows(projectId, user.id)).toEqual([{ role: 'EDITOR' }]);
  });
});

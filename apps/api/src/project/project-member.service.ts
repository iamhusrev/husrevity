import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectMember } from './project-member.entity';
import { ProjectAccessService } from './project-access.service';
import { ProjectInviteService } from './project-invite.service';
import { UserService } from '../user/user.service';
import { MailerService } from '../notification/mailer.service';
import { ApiException } from '../common/api.exception';
import {
  AddProjectMemberDto,
  AddProjectMemberResponseDto,
  ProjectInviteResponseDto,
  ProjectMemberResponseDto,
  UpdateProjectMemberRoleDto,
} from './dto/project-member-dtos';

@Injectable()
export class ProjectMemberService {
  constructor(
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    private readonly access: ProjectAccessService,
    private readonly users: UserService,
    private readonly invites: ProjectInviteService,
    private readonly mailer: MailerService,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: string, projectId: string): Promise<ProjectMemberResponseDto[]> {
    await this.access.requireAccess(userId, projectId, 'VIEWER');
    const rows = await this.members.find({ where: { projectId } });
    rows.sort((a, b) => {
      if (a.role === 'OWNER' && b.role !== 'OWNER') return -1;
      if (b.role === 'OWNER' && a.role !== 'OWNER') return 1;
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
    return Promise.all(
      rows.map(async (m) => ProjectMemberResponseDto.from(m, await this.users.requireById(m.userId))),
    );
  }

  async add(
    userId: string,
    userEmail: string,
    projectId: string,
    dto: AddProjectMemberDto,
  ): Promise<AddProjectMemberResponseDto> {
    const { project } = await this.access.requireAccess(userId, projectId, 'OWNER');
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.users.findByEmail(email);

    if (existingUser) {
      const existingMember = await this.members.findOne({
        where: { projectId, userId: existingUser.id },
        withDeleted: true,
      });
      if (existingMember && !existingMember.deletedAt) {
        throw ApiException.conflict('This user is already a member of the project');
      }

      let member: ProjectMember;
      if (existingMember) {
        existingMember.deletedAt = null;
        existingMember.role = dto.role;
        existingMember.invitedById = userId;
        existingMember.joinedAt = new Date();
        member = await this.members.save(existingMember);
      } else {
        member = await this.members.save(
          this.members.create({
            projectId,
            userId: existingUser.id,
            role: dto.role,
            invitedById: userId,
            joinedAt: new Date(),
          }),
        );
      }

      let emailDelivered = false;
      if (this.mailer.isConfigured() && existingUser.emailNotificationsEnabled) {
        emailDelivered = await this.mailer.sendProjectMemberAddedEmail(
          existingUser.email,
          project.name,
          userEmail,
          this.invites.buildProjectUrl(projectId),
          dto.role,
        );
      }

      return {
        member: ProjectMemberResponseDto.from(member, existingUser),
        invite: null,
        inviteUrl: null,
        emailDelivered,
      };
    }

    const { invite, inviteUrl, emailDelivered } = await this.invites.createInvite(
      projectId,
      userId,
      userEmail,
      email,
      dto.role,
    );
    return {
      member: null,
      invite: ProjectInviteResponseDto.from(invite),
      inviteUrl,
      emailDelivered,
    };
  }

  async updateRole(
    userId: string,
    projectId: string,
    memberId: string,
    dto: UpdateProjectMemberRoleDto,
  ): Promise<ProjectMemberResponseDto> {
    await this.access.requireAccess(userId, projectId, 'OWNER');
    const member = await this.members.findOne({ where: { id: memberId, projectId } });
    if (!member) throw ApiException.notFound('Member not found');
    if (member.role === 'OWNER') {
      throw ApiException.badRequest("The project owner's role cannot be changed");
    }
    member.role = dto.role;
    const saved = await this.members.save(member);
    const user = await this.users.requireById(saved.userId);
    return ProjectMemberResponseDto.from(saved, user);
  }

  async remove(userId: string, projectId: string, memberId: string): Promise<void> {
    await this.access.requireAccess(userId, projectId, 'OWNER');
    const member = await this.members.findOne({ where: { id: memberId, projectId } });
    if (!member) throw ApiException.notFound('Member not found');
    if (member.role === 'OWNER') {
      throw ApiException.badRequest('The project owner cannot be removed');
    }
    await this.members.softRemove(member);
    // Cleanup: a removed member must never linger as a dangling task assignee.
    // task.assignee_id already exists from an earlier migration phase; no
    // service references it yet — this is just defensive housekeeping ahead
    // of the phase that wires up task assignment.
    await this.dataSource.query(
      'UPDATE task SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2',
      [projectId, member.userId],
    );
  }

  async leave(userId: string, projectId: string): Promise<void> {
    const { role } = await this.access.requireAccess(userId, projectId, 'VIEWER');
    if (role === 'OWNER') {
      throw ApiException.badRequest(
        'The project owner cannot leave — delete or transfer the project instead',
      );
    }
    const member = await this.members.findOne({ where: { projectId, userId } });
    if (!member) throw ApiException.notFound('Member not found');
    await this.members.softRemove(member);
    await this.dataSource.query(
      'UPDATE task SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2',
      [projectId, userId],
    );
  }
}

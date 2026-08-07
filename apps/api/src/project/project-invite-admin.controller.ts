import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectInviteService } from './project-invite.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectInviteResponseDto } from './dto/project-member-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';

/**
 * Owner-only management of a project's pending invites — split from
 * ProjectMemberController (`/projects/:projectId/members`) to avoid a route
 * prefix collision, since `:projectId/invites` and `:projectId/members` are
 * siblings, not nested under each other.
 *
 * ProjectInviteService itself doesn't do access checks (it has no notion of
 * "the caller"), so the OWNER-role gate happens here via ProjectAccessService
 * before delegating.
 */
@ApiTags('project-members')
@ApiBearerAuth()
@Controller('projects/:projectId/invites')
export class ProjectInviteAdminController {
  constructor(
    private readonly invites: ProjectInviteService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get()
  async list(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<ProjectInviteResponseDto[]> {
    await this.access.requireAccess(u.userId, projectId, 'OWNER');
    return this.invites.listForProject(projectId);
  }

  @Delete(':inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Param('inviteId', NumericIdPipe) inviteId: string,
  ): Promise<void> {
    await this.access.requireAccess(u.userId, projectId, 'OWNER');
    await this.invites.revoke(projectId, inviteId);
  }
}

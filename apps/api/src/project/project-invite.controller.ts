import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ProjectInviteService } from './project-invite.service';
import { AcceptProjectInviteResponseDto, ProjectInviteLookupDto } from './dto/project-invite-dtos';
import { Public } from '../common/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

/**
 * Public/authenticated counterpart of ProjectInviteRegisterController
 * (apps/api/src/auth/project-invite-register.controller.ts). Both controllers
 * share the `/project-invites` route prefix — this one handles the lookup
 * (unauthenticated) and accept (authenticated, existing account) legs; the
 * brand-new-account registration leg lives in AuthModule instead, to avoid a
 * ProjectModule → AuthModule circular dependency. See that file's header
 * comment for the full rationale.
 */
@ApiTags('project-invites')
@Controller('project-invites')
export class ProjectInviteController {
  constructor(private readonly invites: ProjectInviteService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  lookup(@Param('token') token: string): Promise<ProjectInviteLookupDto> {
    return this.invites.lookup(token);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':token/accept')
  accept(
    @CurrentUser() u: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<AcceptProjectInviteResponseDto> {
    return this.invites.acceptForExistingUser(token, u.userId, u.email);
  }
}

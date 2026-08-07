import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-dtos';
import { ProjectInviteService } from '../project/project-invite.service';
import { RegisterViaProjectInviteDto } from '../project/dto/project-invite-dtos';
import { Public } from '../common/public.decorator';

/**
 * Handles "register a brand-new account via a project invite token" —
 * `POST /project-invites/:token/register`.
 *
 * WHY THIS LIVES IN `auth/` INSTEAD OF `project/`, EVEN THOUGH THE ROUTE
 * PREFIX MATCHES ProjectInviteController (`project/project-invite.controller.ts`):
 *
 * This endpoint needs both ProjectInviteService (to validate the token and
 * create the User + ProjectMember rows) and AuthService.issueTokensFor() (to
 * mint JWTs for the brand-new user). AuthModule already imports ProjectModule
 * (so AuthService.register() can activate pending project invites for a
 * newly-registered email) — that dependency only ever points one way,
 * AuthModule → ProjectModule. If this controller instead lived inside
 * ProjectModule, ProjectModule would need AuthService, creating a circular
 * module dependency. Splitting by controller (not by service) keeps the
 * graph one-directional without forwardRef().
 *
 * ProjectInviteService itself never depends on AuthService — its
 * `registerAndCreateMember` only creates rows and returns the saved User;
 * this controller is the one place that combines that with token issuance.
 */
@ApiTags('auth')
@Controller('project-invites')
export class ProjectInviteRegisterController {
  constructor(
    private readonly projectInvites: ProjectInviteService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Param('token') token: string,
    @Body() body: RegisterViaProjectInviteDto,
  ): Promise<AuthResponseDto> {
    const user = await this.projectInvites.registerAndCreateMember(token, body);
    return this.auth.issueTokensFor(user);
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import {
  AcceptInviteDto,
  InviteLookupDto,
} from './dto/admin-dtos';
import { AuthResponseDto } from '../auth/dto/auth-dtos';
import { Public } from '../common/public.decorator';

/**
 * Public counterpart to AdminController for the invite-acceptance flow.
 * Lives under `/api/auth/invite/*` so it slots next to register / login in
 * the web app's auth area.
 *
 * Two endpoints:
 *   GET  /auth/invite/:token        → look up the invite (used by the
 *                                     accept page to render the recipient's
 *                                     email + expiry without requiring login)
 *   POST /auth/invite/:token/accept → set a password, create the user, mint
 *                                     auth tokens just like register would.
 *
 * Throttled the same as register/login to slow token-guessing.
 */
@ApiTags('auth')
@Controller('auth/invite')
export class InviteController {
  constructor(private readonly admin: AdminService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  lookup(@Param('token') token: string): Promise<InviteLookupDto> {
    return this.admin.lookupInvite(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/accept')
  @HttpCode(HttpStatus.CREATED)
  accept(
    @Param('token') token: string,
    @Body() body: AcceptInviteDto,
  ): Promise<AuthResponseDto> {
    return this.admin.acceptInvite(token, body);
  }
}

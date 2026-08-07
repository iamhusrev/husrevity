import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/current-user.decorator';
import { UserService } from './user.service';
import { UserSummaryDto } from './user.dto';

/**
 * General "who else is in the system" directory — deliberately minimal
 * (id/email/name only, no role/enabled/preferences) since any authenticated
 * user can call it, not just admins. Used by the project member-add UI to
 * let an owner pick a collaborator instead of typing their email.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async list(@CurrentUser() u: AuthenticatedUser): Promise<UserSummaryDto[]> {
    const users = await this.userService.listSelectable(u.userId);
    return users.map(UserSummaryDto.from);
  }
}

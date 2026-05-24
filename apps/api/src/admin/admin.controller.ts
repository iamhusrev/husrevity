import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  AdminResetPasswordDto,
  AdminUpdateUserDto,
  AdminUserDto,
  AdminUserListQueryDto,
  AdminUserListResponseDto,
  CreateInviteDto,
  CreatedInviteDto,
  InviteResponseDto,
} from './dto/admin-dtos';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ─── Users ───────────────────────────────────────────────────────────────

  @Get('users')
  listUsers(
    @Query() q: AdminUserListQueryDto,
  ): Promise<AdminUserListResponseDto> {
    return this.admin.listUsers(q);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string): Promise<AdminUserDto> {
    return this.admin.getUser(id);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AdminUpdateUserDto,
  ): Promise<AdminUserDto> {
    return this.admin.updateUser(u.userId, id, body);
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id') id: string,
    @Body() body: AdminResetPasswordDto,
  ): Promise<void> {
    return this.admin.resetPassword(id, body);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.admin.deleteUser(u.userId, id);
  }

  // ─── Invites ─────────────────────────────────────────────────────────────

  @Get('invites')
  listInvites(): Promise<InviteResponseDto[]> {
    return this.admin.listInvites();
  }

  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  createInvite(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: CreateInviteDto,
  ): Promise<CreatedInviteDto> {
    return this.admin.createInvite(u.userId, u.email, body);
  }

  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@Param('id') id: string): Promise<void> {
    return this.admin.revokeInvite(id);
  }
}

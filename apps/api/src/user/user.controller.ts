import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { UserService } from './user.service';
import {
  ChangePasswordDto,
  NotificationPreferencesDto,
  UpdateProfileDto,
  UserDto,
} from './user.dto';

@ApiTags('user')
@ApiBearerAuth()
@Controller('me')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    const found = await this.userService.requireById(user.userId);
    return UserDto.from(found);
  }

  @Put()
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileDto,
  ): Promise<UserDto> {
    const updated = await this.userService.updateProfile(user.userId, body);
    return UserDto.from(updated);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.userService.changePassword(user.userId, body);
  }

  @Patch('notification-preferences')
  async updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: NotificationPreferencesDto,
  ): Promise<UserDto> {
    const updated = await this.userService.updateNotificationPreferences(
      user.userId,
      body,
    );
    return UserDto.from(updated);
  }
}

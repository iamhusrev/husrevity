import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { User } from './user.entity';

export class UpdateProfileDto {
  @IsOptional()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @MaxLength(80)
  lastName?: string;
}

export class ChangePasswordDto {
  @IsNotEmpty()
  currentPassword!: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  newPassword!: string;
}

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

export class UserDto {
  id!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  enabled!: boolean;
  emailNotificationsEnabled!: boolean;
  role!: string;

  static from(u: User): UserDto {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      enabled: u.enabled,
      emailNotificationsEnabled: u.emailNotificationsEnabled,
      role: u.role,
    };
  }
}

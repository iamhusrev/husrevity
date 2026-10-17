import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NAV_ITEM_IDS, NavItemId, NavPreferences } from './nav-items';
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

export class NavSectionsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(NAV_ITEM_IDS, { each: true })
  core!: NavItemId[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(NAV_ITEM_IDS, { each: true })
  daily!: NavItemId[];
}

export class NavPreferencesDto implements NavPreferences {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => NavSectionsDto)
  sections!: NavSectionsDto;
}

export class UserDto {
  id!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  enabled!: boolean;
  emailNotificationsEnabled!: boolean;
  role!: string;
  navPreferences!: NavPreferences | null;

  static from(u: User): UserDto {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      enabled: u.enabled,
      emailNotificationsEnabled: u.emailNotificationsEnabled,
      role: u.role,
      navPreferences: u.navPreferences ?? null,
    };
  }
}

/**
 * Deliberately narrow projection of `User` for the general "list registered
 * users" directory (see `UsersController`) — id/email/name only, never
 * `role`/`enabled`/`emailNotificationsEnabled`/`passwordHash`, since that
 * endpoint is reachable by any authenticated user, not just admins.
 */
export class UserSummaryDto {
  id!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;

  static from(u: User): UserSummaryDto {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
    };
  }
}

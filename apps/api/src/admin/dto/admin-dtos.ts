import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { User } from '../../user/user.entity';
import { UserInvite } from '../user-invite.entity';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export class AdminUserListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AdminUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(80)
  firstName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(80)
  lastName?: string | null;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn([...ROLES])
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AdminResetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  newPassword!: string;
}

export class AdminUserDto {
  id!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  enabled!: boolean;
  role!: string;
  emailNotificationsEnabled!: boolean;
  createdAt!: string;
  updatedAt!: string;

  static from(u: User): AdminUserDto {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      enabled: u.enabled,
      role: u.role,
      emailNotificationsEnabled: u.emailNotificationsEnabled,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }
}

export class AdminUserListResponseDto {
  items!: AdminUserDto[];
  total!: number;
}

// ─── Invites ───────────────────────────────────────────────────────────────

export class CreateInviteDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional({ enum: ROLES, default: 'user' })
  @IsOptional()
  @IsIn([...ROLES])
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(80)
  lastName?: string;
}

export class InviteResponseDto {
  id!: string;
  email!: string;
  role!: string;
  firstName!: string | null;
  lastName!: string | null;
  expiresAt!: string;
  acceptedAt!: string | null;
  acceptedUserId!: string | null;
  createdAt!: string;

  static from(i: UserInvite): InviteResponseDto {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      firstName: i.firstName,
      lastName: i.lastName,
      expiresAt: i.expiresAt.toISOString(),
      acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
      acceptedUserId: i.acceptedUserId,
      createdAt: i.createdAt.toISOString(),
    };
  }
}

/** Returned by `POST /api/admin/invites` — includes the plaintext URL once. */
export class CreatedInviteDto extends InviteResponseDto {
  inviteUrl!: string;
  emailDelivered!: boolean;
}

// ─── Public (invite acceptance) ────────────────────────────────────────────

export class InviteLookupDto {
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  expiresAt!: string;
  invitedByEmail!: string;
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(80)
  lastName?: string;
}

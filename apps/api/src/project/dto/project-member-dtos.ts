import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { ProjectMember, ProjectRole } from '../project-member.entity';
import { ProjectInvite } from '../project-invite.entity';
import { User } from '../../user/user.entity';

/** Roles that can be granted through the member/invite endpoints — OWNER is never assignable this way. */
export const ASSIGNABLE_PROJECT_ROLES = ['EDITOR', 'VIEWER'] as const;

export class AddProjectMemberDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({ enum: ASSIGNABLE_PROJECT_ROLES })
  @IsIn([...ASSIGNABLE_PROJECT_ROLES])
  role!: ProjectRole;
}

export class UpdateProjectMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_PROJECT_ROLES })
  @IsIn([...ASSIGNABLE_PROJECT_ROLES])
  role!: ProjectRole;
}

export class ProjectMemberResponseDto {
  id!: string;
  userId!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  @ApiProperty() role!: ProjectRole;
  joinedAt!: string;

  static from(m: ProjectMember, u: User): ProjectMemberResponseDto {
    return {
      id: m.id,
      userId: m.userId,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    };
  }
}

export class ProjectInviteResponseDto {
  id!: string;
  email!: string;
  @ApiProperty() role!: ProjectRole;
  expiresAt!: string;
  createdAt!: string;

  static from(i: ProjectInvite): ProjectInviteResponseDto {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    };
  }
}

/** Returned by POST /projects/:projectId/members — exactly one of member/invite is non-null. */
export class AddProjectMemberResponseDto {
  @ApiPropertyOptional() member!: ProjectMemberResponseDto | null;
  @ApiPropertyOptional() invite!: ProjectInviteResponseDto | null;
  @ApiPropertyOptional() inviteUrl!: string | null;
  @ApiProperty() emailDelivered!: boolean;
}

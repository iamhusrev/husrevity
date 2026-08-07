import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ProjectRole } from '../project-member.entity';

export class ProjectInviteLookupDto {
  projectName!: string;
  projectCode!: string;
  email!: string;
  @ApiProperty() role!: ProjectRole;
  invitedByEmail!: string;
  expiresAt!: string;
  /** True when no User account exists yet for this invite's email. */
  requiresRegistration!: boolean;
}

export class AcceptProjectInviteResponseDto {
  projectId!: string;
  @ApiProperty() role!: ProjectRole;
}

export class RegisterViaProjectInviteDto {
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

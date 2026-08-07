import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectInvite } from './project-invite.entity';
import { ProjectService } from './project.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectMemberService } from './project-member.service';
import { ProjectInviteService } from './project-invite.service';
import { ProjectController } from './project.controller';
import { ProjectMemberController } from './project-member.controller';
import { ProjectInviteController } from './project-invite.controller';
import { ProjectInviteAdminController } from './project-invite-admin.controller';
import { UserModule } from '../user/user.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, ProjectInvite]),
    UserModule,
    NotificationModule,
  ],
  providers: [ProjectService, ProjectAccessService, ProjectMemberService, ProjectInviteService],
  controllers: [
    ProjectController,
    ProjectMemberController,
    ProjectInviteController,
    ProjectInviteAdminController,
  ],
  exports: [ProjectService, ProjectAccessService, ProjectInviteService],
})
export class ProjectModule {}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberService } from './project-member.service';
import {
  AddProjectMemberDto,
  AddProjectMemberResponseDto,
  ProjectMemberResponseDto,
  UpdateProjectMemberRoleDto,
} from './dto/project-member-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';

@ApiTags('project-members')
@ApiBearerAuth()
@Controller('projects/:projectId/members')
export class ProjectMemberController {
  constructor(private readonly memberService: ProjectMemberService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<ProjectMemberResponseDto[]> {
    return this.memberService.list(u.userId, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Body() body: AddProjectMemberDto,
  ): Promise<AddProjectMemberResponseDto> {
    return this.memberService.add(u.userId, u.email, projectId, body);
  }

  // IMPORTANT ROUTE-ORDER NOTE: declare the literal "me" route BEFORE the
  // ":memberId" route. NestJS/Express matches routes in declaration order
  // within a controller — if ":memberId" (piped through NumericIdPipe) came
  // first, "DELETE /members/me" would try to numeric-parse "me" and 400
  // before ever reaching the /me handler.
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
  ): Promise<void> {
    return this.memberService.leave(u.userId, projectId);
  }

  @Patch(':memberId')
  updateRole(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Param('memberId', NumericIdPipe) memberId: string,
    @Body() body: UpdateProjectMemberRoleDto,
  ): Promise<ProjectMemberResponseDto> {
    return this.memberService.updateRole(u.userId, projectId, memberId, body);
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('projectId', NumericIdPipe) projectId: string,
    @Param('memberId', NumericIdPipe) memberId: string,
  ): Promise<void> {
    return this.memberService.remove(u.userId, projectId, memberId);
  }
}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PatService } from './pat.service';
import { IssuePatRequestDto, IssuedPatResponseDto, PatResponseDto } from './dto/pat-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';

/** A logged-in user (JWT) manages their own personal access tokens here — used by MCP (Faz 4) and, later, other API clients. */
@ApiTags('pat')
@ApiBearerAuth()
@Controller('pat')
export class PatController {
  constructor(private readonly pat: PatService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: IssuePatRequestDto,
  ): Promise<IssuedPatResponseDto> {
    const { id, rawToken } = await this.pat.issue(
      u.userId,
      body.name,
      body.scopes,
      body.expiresAt ? new Date(body.expiresAt) : null,
    );
    return { id, token: rawToken };
  }

  @Get()
  async list(@CurrentUser() u: AuthenticatedUser): Promise<PatResponseDto[]> {
    const rows = await this.pat.list(u.userId);
    return rows.map(PatResponseDto.from);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<void> {
    return this.pat.revoke(u.userId, id);
  }
}

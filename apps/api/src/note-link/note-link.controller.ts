import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NoteLinkService } from './note-link.service';
import {
  CreateNoteLinkDto,
  LinkedNoteDto,
  NoteLinkQueryDto,
  NoteLinkResponseDto,
} from './dto/note-link-dtos';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { isValidNumericId, NumericIdPipe } from '../common/numeric-id.pipe';
import { ApiException } from '../common/api.exception';

@ApiTags('note-links')
@ApiBearerAuth()
@Controller()
export class NoteLinkController {
  constructor(private readonly service: NoteLinkService) {}

  @Get('notes/:id/links')
  async getLinks(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<NoteLinkResponseDto[]> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid note id: must be a numeric ID (1-19 digits)');
    }
    return this.service.getLinksForNote(u.userId, id);
  }

  @Post('notes/:id/links')
  @HttpCode(HttpStatus.CREATED)
  async createLink(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Body() body: CreateNoteLinkDto,
  ): Promise<NoteLinkResponseDto> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid note id: must be a numeric ID (1-19 digits)');
    }
    return this.service.createLink(u.userId, id, body);
  }

  @Delete('notes/:id/links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLink(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Param('linkId', NumericIdPipe) linkId: string,
  ): Promise<void> {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest('Invalid note id: must be a numeric ID (1-19 digits)');
    }
    if (!isValidNumericId(linkId)) {
      throw ApiException.badRequest('Invalid link id: must be a numeric ID (1-19 digits)');
    }
    return this.service.deleteLink(u.userId, id, linkId);
  }

  @Get('note-links')
  async listForTarget(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: NoteLinkQueryDto,
  ): Promise<LinkedNoteDto[]> {
    if (!isValidNumericId(query.targetId)) {
      throw ApiException.badRequest('Invalid target id: must be a numeric ID (1-19 digits)');
    }
    return this.service.listNotesForTarget(u.userId, query);
  }
}

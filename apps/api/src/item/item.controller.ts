import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParsedDraft } from '@husrevity/parser';
import { ItemService } from './item.service';
import {
  CompleteItemRequestDto,
  ItemExportQueryDto,
  ItemListQueryDto,
  ItemRequestDto,
  ItemResponseDto,
  ParseQuickAddRequestDto,
  ItemUpdateRequestDto,
} from './dto/item-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { parseIfMatch } from '../common/if-match';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemController {
  constructor(private readonly items: ItemService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ItemListQueryDto,
  ): Promise<ItemResponseDto[]> {
    return this.items.list(u.userId, query);
  }

  /**
   * Raw text/calendar body: uses @Res() without passthrough so the JSON
   * ResponseInterceptor envelope is not applied. Must stay above `:id`.
   */
  @Get('export.ics')
  @ApiOperation({
    summary:
      "Export the caller's schedule as an ICS file. Skipped occurrences of a recurring series become EXDATE; " +
      'completed occurrences are NOT exported and will still appear in an external calendar.',
  })
  async exportIcs(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ItemExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const ics = await this.items.exportIcs(u.userId, query);
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="husrevity-${query.from}_${query.to}.ics"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(ics);
  }

  @Get(':id')
  async get(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ItemResponseDto> {
    const dto = await this.items.get(u.userId, id);
    res.setHeader('ETag', `"${new Date(dto.updatedAt).getTime()}"`);
    return dto;
  }

  @Post('parse-quick-add')
  parseQuickAdd(@Body() body: ParseQuickAddRequestDto): Promise<ParsedDraft> {
    return this.items.parseQuickAddText(body.text);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: ItemRequestDto,
  ): Promise<ItemResponseDto> {
    return this.items.create(u.userId, body);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Body() body: ItemUpdateRequestDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<ItemResponseDto> {
    return this.items.update(u.userId, id, body, parseIfMatch(ifMatch));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    return this.items.delete(u.userId, id, undefined, parseIfMatch(ifMatch));
  }

  @Post(':id/complete')
  @UseInterceptors(IdempotencyInterceptor)
  complete(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Body() body: CompleteItemRequestDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<ItemResponseDto> {
    return this.items.complete(u.userId, id, body, undefined, parseIfMatch(ifMatch));
  }
}

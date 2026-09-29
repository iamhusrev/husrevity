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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParsedDraft } from '@husrevity/parser';
import { ItemService } from './item.service';
import {
  CompleteItemRequestDto,
  ItemListQueryDto,
  ItemRequestDto,
  ItemResponseDto,
  ParseQuickAddRequestDto,
} from './dto/item-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { NumericIdPipe } from '../common/numeric-id.pipe';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

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
    @Body() body: Partial<ItemRequestDto>,
    @Headers('if-match') ifMatch?: string,
  ): Promise<ItemResponseDto> {
    const ifMatchMs = ifMatch ? Number(ifMatch.replace(/"/g, '')) : undefined;
    return this.items.update(u.userId, id, body, ifMatchMs);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
  ): Promise<void> {
    return this.items.delete(u.userId, id);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', NumericIdPipe) id: string,
    @Body() body: CompleteItemRequestDto,
  ): Promise<ItemResponseDto> {
    return this.items.complete(u.userId, id, body);
  }
}

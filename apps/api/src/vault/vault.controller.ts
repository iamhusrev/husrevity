import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { VaultService } from './vault.service';
import {
  EntityRequestDto,
  EntityResponseDto,
  ItemRequestDto,
  ItemResponseDto,
  ItemUpdateRequestDto,
} from './dto/vault-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@ApiTags('vault')
@ApiBearerAuth()
@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  // ─── Entries ────────────────────────────────────────────────────────────────

  @Get('entities')
  listEntities(@CurrentUser() u: AuthenticatedUser): Promise<EntityResponseDto[]> {
    return this.vault.listEntities(u.userId);
  }

  @Post('entities')
  @HttpCode(HttpStatus.CREATED)
  createEntity(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: EntityRequestDto,
  ): Promise<EntityResponseDto> {
    return this.vault.createEntity(u.userId, body);
  }

  @Put('entities/:id')
  updateEntity(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: EntityRequestDto,
  ): Promise<EntityResponseDto> {
    return this.vault.updateEntity(u.userId, id, body);
  }

  @Delete('entities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEntity(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.vault.deleteEntity(u.userId, id);
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  @Get('entities/:id/items')
  listItems(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ItemResponseDto[]> {
    return this.vault.listItems(u.userId, id);
  }

  @Post('entities/:id/items')
  @HttpCode(HttpStatus.CREATED)
  createItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ItemRequestDto,
  ): Promise<ItemResponseDto> {
    return this.vault.createItem(u.userId, id, body);
  }

  @Put('items/:id')
  updateItem(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ItemUpdateRequestDto,
  ): Promise<ItemResponseDto> {
    return this.vault.updateItem(u.userId, id, body);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.vault.deleteItem(u.userId, id);
  }

  // ─── Import / Export ────────────────────────────────────────────────────────

  /** Body: raw text/plain .env content. Express needs `text/plain` body parser; we
   *  read directly from req.body when it's a string, otherwise treat the body
   *  property as a string-like value. */
  @Post('entities/:id/import')
  importEnv(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ItemResponseDto[]> {
    const body = req.body;
    const raw = typeof body === 'string' ? body : String(body ?? '');
    return this.vault.importEnv(u.userId, id, raw);
  }

  /** Returns raw text/plain. Uses @Res() so ResponseInterceptor does NOT wrap
   *  it in the JSON envelope — the web reads this as plain text. */
  @Get('entities/:id/export')
  async exportEnv(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const env = await this.vault.exportEnv(u.userId, id);
    res.type('text/plain').send(env);
  }
}

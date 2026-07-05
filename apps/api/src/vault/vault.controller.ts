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
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { VaultService } from './vault.service';
import {
  CsvImportOptionsDto,
  EntityRequestDto,
  EntityResponseDto,
  ImportResultDto,
  ItemRequestDto,
  ItemResponseDto,
  ItemUpdateRequestDto,
} from './dto/vault-dtos';
import { ApiException } from '../common/api.exception';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

const CSV_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

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

  /** Bulk-imports vault items from an uploaded CSV file (columns: name, url,
   *  username, password). Multipart form-data — `file` is the CSV, remaining
   *  fields (e.g. `skipDuplicates`) are bound to CsvImportOptionsDto. */
  @Post('import-csv')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CSV_MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        const isCsv =
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.toLowerCase().endsWith('.csv');
        if (!isCsv) {
          callback(ApiException.badRequest('Only .csv files are allowed'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  importCsv(
    @CurrentUser() u: AuthenticatedUser,
    @Query('entityId') entityId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() options: CsvImportOptionsDto,
  ): Promise<ImportResultDto> {
    if (!entityId) throw ApiException.badRequest('entityId query parameter is required');
    if (!file) throw ApiException.badRequest('CSV file is required');
    return this.vault.importCsv(u.userId, entityId, file.buffer, options);
  }
}

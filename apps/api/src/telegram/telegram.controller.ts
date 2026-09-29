import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramConfig } from './telegram.config';
import { TelegramLinkCodeResponseDto, TelegramLinkStatusResponseDto } from './dto/telegram-dtos';

/**
 * Endpoint for managing Telegram bot account linking.
 */
@ApiTags('telegram')
@ApiBearerAuth()
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramLinkService: TelegramLinkService,
    private readonly telegramConfig: TelegramConfig,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Current link state of the caller' })
  @ApiResponse({ status: 200, type: TelegramLinkStatusResponseDto })
  async status(@CurrentUser() u: AuthenticatedUser): Promise<TelegramLinkStatusResponseDto> {
    const link = await this.telegramLinkService.findByOwner(u.userId);
    const pending =
      link?.status === 'pending' && !!link.linkCode && !!link.linkCodeExpiresAt && link.linkCodeExpiresAt > new Date();
    return {
      configured: this.telegramConfig.isConfigured(),
      linked: link?.status === 'linked',
      botUsername: this.telegramConfig.botUsername ?? null,
      linkedAt: link?.linkedAt ? link.linkedAt.toISOString() : null,
      pendingCode: pending ? link!.linkCode : null,
      pendingCodeExpiresAt: pending ? link!.linkCodeExpiresAt!.toISOString() : null,
    };
  }

  @Post('link-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a short-lived link code to bind a Telegram chat' })
  @ApiResponse({ status: 200, type: TelegramLinkCodeResponseDto })
  async generateLinkCode(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<TelegramLinkCodeResponseDto> {
    const link = await this.telegramLinkService.generateLinkCode(u.userId);
    return {
      code: link.linkCode!,
      botUsername: this.telegramConfig.botUsername ?? null,
      expiresAt: link.linkCodeExpiresAt!.toISOString(),
    };
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink Telegram account' })
  @ApiResponse({ status: 204 })
  async unlink(@CurrentUser() u: AuthenticatedUser): Promise<void> {
    await this.telegramLinkService.unlink(u.userId);
  }
}

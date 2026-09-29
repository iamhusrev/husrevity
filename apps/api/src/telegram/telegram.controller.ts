import { Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramConfig } from './telegram.config';
import { TelegramLinkCodeResponseDto } from './dto/telegram-dtos';

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

import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { SlackLinkService } from './slack-link.service';
import { SlackConfig } from './slack.config';
import { SlackLinkCodeResponseDto, SlackLinkStatusResponseDto } from './dto/slack-dtos';

/**
 * Endpoint for managing Slack bot account linking.
 */
@ApiTags('slack')
@ApiBearerAuth()
@Controller('slack')
export class SlackController {
  constructor(
    private readonly slackLinkService: SlackLinkService,
    private readonly slackConfig: SlackConfig,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Current link state of the caller' })
  @ApiResponse({ status: 200, type: SlackLinkStatusResponseDto })
  async status(@CurrentUser() u: AuthenticatedUser): Promise<SlackLinkStatusResponseDto> {
    const link = await this.slackLinkService.findByOwner(u.userId);
    const pending =
      link?.status === 'pending' && !!link.linkCode && !!link.linkCodeExpiresAt && link.linkCodeExpiresAt > new Date();
    return {
      configured: this.slackConfig.isConfigured(),
      linked: link?.status === 'linked',
      botUsername: this.slackConfig.botUsername ?? null,
      linkedAt: link?.linkedAt ? link.linkedAt.toISOString() : null,
      pendingCode: pending ? link!.linkCode : null,
      pendingCodeExpiresAt: pending ? link!.linkCodeExpiresAt!.toISOString() : null,
    };
  }

  @Post('link-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a short-lived link code to bind a Slack user' })
  @ApiResponse({ status: 200, type: SlackLinkCodeResponseDto })
  async generateLinkCode(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<SlackLinkCodeResponseDto> {
    const link = await this.slackLinkService.generateLinkCode(u.userId);
    return {
      code: link.linkCode!,
      botUsername: this.slackConfig.botUsername ?? null,
      expiresAt: link.linkCodeExpiresAt!.toISOString(),
    };
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink Slack account' })
  @ApiResponse({ status: 204 })
  async unlink(@CurrentUser() u: AuthenticatedUser): Promise<void> {
    await this.slackLinkService.unlink(u.userId);
  }
}

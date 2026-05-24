import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { GmailOAuthService } from './gmail-oauth.service';
import { GoogleOAuthConfig } from './google-oauth.config';
import { Provider } from './gmail-token.service';
import {
  AccountResponseDto,
  AuthorizeUrlResponseDto,
  MobileCallbackRequestDto,
} from './dto/gmail-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { ApiException } from '../common/api.exception';

function normalizeProvider(p: string | undefined): Provider {
  return p === 'microsoft' ? 'microsoft' : 'google';
}

@ApiTags('gmail-oauth')
@Controller('gmail/oauth')
export class GmailOAuthController {
  constructor(
    private readonly oauth: GmailOAuthService,
    private readonly config: GoogleOAuthConfig,
  ) {}

  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('authorize-url')
  @HttpCode(HttpStatus.OK)
  authorizeUrl(
    @CurrentUser() u: AuthenticatedUser,
    @Query('provider') provider?: string,
  ): AuthorizeUrlResponseDto {
    return this.oauth.buildAuthorizeUrl(u.userId, normalizeProvider(provider));
  }

  /**
   * Web flow callback (public). state = `${userId}:${provider}:${nonce}`
   * (legacy `${userId}:${nonce}` is treated as google).
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const web = this.config.webUrl;
    try {
      if (!code || !state) throw ApiException.badRequest('Missing code or state');
      const { userId, provider } = this.parseState(state);
      await this.oauth.completeWebCallback(userId, provider, code, state);
      res.redirect(`${web}/gmail?connected=1`);
    } catch (e) {
      const msg = encodeURIComponent((e as Error).message ?? 'oauth_failed');
      res.redirect(`${web}/gmail?error=${msg}`);
    }
  }

  @ApiBearerAuth()
  @Post('callback-mobile')
  @HttpCode(HttpStatus.CREATED)
  async callbackMobile(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: MobileCallbackRequestDto,
  ): Promise<AccountResponseDto> {
    const account = await this.oauth.completeMobileCallback(
      u.userId,
      'google',
      body.code,
      body.redirectUri,
      body.codeVerifier,
    );
    return AccountResponseDto.from(account, 0);
  }

  private parseState(state: string): { userId: string; provider: Provider } {
    const parts = state.split(':');
    const userId = parts[0];
    if (!userId || !/^\d+$/.test(userId)) throw ApiException.badRequest('Invalid state');
    // 3-part = userId:provider:nonce ; legacy 2-part = userId:nonce (google)
    const provider = parts.length >= 3 ? normalizeProvider(parts[1]) : 'google';
    return { userId, provider };
  }
}

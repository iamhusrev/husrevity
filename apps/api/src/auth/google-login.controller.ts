import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ApiException } from '../common/api.exception';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { GOOGLE_FLOW_COOKIE, GoogleLoginService } from './google-login.service';
import {
  GoogleCallbackQueryDto,
  GoogleConfigResponseDto,
  GoogleExchangeRequestDto,
  GoogleExchangeResponseDto,
  GoogleIdentityStatusDto,
  GoogleLinkStartRequestDto,
  GoogleLinkStartResponseDto,
  GoogleStartQueryDto,
} from './dto/google-login-dtos';

const FLOW_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
const FETCH_SITES = new Set(['same-origin', 'same-site', 'cross-site', 'none']);

/**
 * Browsers send Fetch Metadata on every request. When present, /start must be
 * a top-level document navigation: not a fetch/XHR, not an <img>/<iframe>
 * embed. Non-browser clients that omit the headers are not blocked (they gain
 * nothing: the callback needs the flow cookie in the same browser).
 */
export function assertTopLevelNavigation(headers: Request['headers']): void {
  const site = headers['sec-fetch-site'];
  const mode = headers['sec-fetch-mode'];
  const dest = headers['sec-fetch-dest'];
  if (site !== undefined && !FETCH_SITES.has(String(site))) {
    throw ApiException.badRequest('Invalid request');
  }
  if (mode !== undefined && mode !== 'navigate') throw ApiException.badRequest('Invalid request');
  if (dest !== undefined && dest !== 'document') throw ApiException.badRequest('Invalid request');
}

@ApiTags('auth')
@Controller('auth/google')
export class GoogleLoginController {
  constructor(private readonly google: GoogleLoginService) {}

  /** Lets the web decide whether to render the "Sign in with Google" button. */
  @Public()
  @Get('config')
  config(): GoogleConfigResponseDto {
    return { enabled: this.google.isEnabled() };
  }

  @Public()
  @Throttle(FLOW_THROTTLE)
  @Get('start')
  async start(
    @Query() query: GoogleStartQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.google.assertEnabled();
    assertTopLevelNavigation(req.headers);
    const { authUrl, cookieValue } = await this.google.start({
      codeChallenge: query.code_challenge,
      ticket: query.ticket,
    });
    const { path, secure } = this.google.cookieOptions();
    res.cookie(GOOGLE_FLOW_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path,
      maxAge: 10 * 60 * 1000,
    });
    noStore(res);
    res.redirect(302, authUrl);
  }

  @Public()
  @Throttle(FLOW_THROTTLE)
  @Get('callback')
  async callback(
    @Query() query: GoogleCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl } = await this.google.handleCallback(query, req.headers.cookie);
    const { path, secure } = this.google.cookieOptions();
    res.clearCookie(GOOGLE_FLOW_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path });
    noStore(res);
    res.redirect(302, redirectUrl);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  exchange(
    @Body() body: GoogleExchangeRequestDto,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GoogleExchangeResponseDto> {
    return this.google.exchange(body, authorization);
  }

  @ApiBearerAuth()
  @Throttle(FLOW_THROTTLE)
  @Post('link/start')
  @HttpCode(HttpStatus.OK)
  linkStart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: GoogleLinkStartRequestDto,
  ): Promise<GoogleLinkStartResponseDto> {
    return this.google.beginLink(user.userId, body.codeChallenge);
  }

  @ApiBearerAuth()
  @Get('identity')
  identity(@CurrentUser() user: AuthenticatedUser): Promise<GoogleIdentityStatusDto> {
    return this.google.status(user.userId);
  }

  @ApiBearerAuth()
  @Delete('identity')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.google.unlink(user.userId);
  }
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

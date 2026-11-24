import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** base64url(SHA-256(verifier)) is always exactly 43 characters. */
export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** `GET /integrations/google-calendar/connect[-url]?codeChallenge=` */
export class CodeChallengeQueryDto {
  @IsString()
  @Matches(CODE_CHALLENGE_PATTERN, { message: 'codeChallenge must be a base64url SHA-256 hash' })
  codeChallenge!: string;
}

/** `POST /integrations/google-calendar/narrow` */
export class CodeChallengeBodyDto {
  @IsString()
  @Matches(CODE_CHALLENGE_PATTERN, { message: 'codeChallenge must be a base64url SHA-256 hash' })
  codeChallenge!: string;
}

/** `POST /integrations/google-calendar/exchange` (single-use handoff code + the web-held PKCE verifier). */
export class CalendarExchangeRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  code!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(128)
  verifier!: string;
}

export interface CalendarExchangeResponse {
  /** True when the tokens were stored (connect), narrowed or write enabled. */
  connected: boolean;
  kind: 'connect' | 'narrow' | 'write';
}

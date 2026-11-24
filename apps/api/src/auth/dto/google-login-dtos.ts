import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** base64url(SHA-256(verifier)) is always exactly 43 characters. */
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export class GoogleStartQueryDto {
  @IsOptional()
  @IsString()
  @Matches(CODE_CHALLENGE, { message: 'code_challenge must be a base64url SHA-256 hash' })
  code_challenge?: string;

  /** Single-use ticket from POST /auth/google/link/start (account linking only). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  ticket?: string;
}

export class GoogleCallbackQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  error?: string;
}

export class GoogleExchangeRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  code!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(128)
  verifier!: string;
}

export class GoogleLinkStartRequestDto {
  @IsString()
  @Matches(CODE_CHALLENGE, { message: 'codeChallenge must be a base64url SHA-256 hash' })
  codeChallenge!: string;
}

export class GoogleLinkStartResponseDto {
  ticket!: string;
}

export class GoogleConfigResponseDto {
  enabled!: boolean;
}

export class GoogleIdentityStatusDto {
  linked!: boolean;
  email!: string | null;
  passwordLoginEnabled!: boolean;
}

/** `login` carries a session like /auth/login; `link` only confirms the binding. */
export class GoogleExchangeResponseDto {
  purpose!: 'login' | 'link';
  accessToken?: string;
  refreshToken?: string;
  user?: import('../../user/user.dto').UserDto;
  linked?: boolean;
  email?: string;
}

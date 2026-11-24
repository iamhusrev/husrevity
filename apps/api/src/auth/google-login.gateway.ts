import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleLoginConfig } from './google-login.config';

/** Injection token for the Google side of the sign-in flow (faked in tests). */
export const GOOGLE_LOGIN_GATEWAY = Symbol('GOOGLE_LOGIN_GATEWAY');

/** Raw claims of a Google ID token; every claim is re-checked by GoogleIdTokenVerifier. */
export interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nonce?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * The only two Google calls sign-in needs. Deliberately returns the ID token
 * only: the access and refresh tokens of a login are never exposed to, let
 * alone stored by, the app. FakeGoogleGateway satisfies this structurally.
 */
export interface GoogleLoginGateway {
  exchangeCode(
    code: string,
    opts?: { redirectUri?: string; codeVerifier?: string },
  ): Promise<{ id_token?: string | null }>;
  /** Must verify the JWT signature; claims are validated again by the caller. */
  verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims>;
}

@Injectable()
export class GoogleOAuthLoginGateway implements GoogleLoginGateway {
  constructor(private readonly config: GoogleLoginConfig) {}

  async exchangeCode(
    code: string,
    opts: { redirectUri?: string; codeVerifier?: string } = {},
  ): Promise<{ id_token?: string | null }> {
    const client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      opts.redirectUri ?? this.config.redirectUri,
    );
    const { tokens } = await client.getToken({
      code,
      codeVerifier: opts.codeVerifier,
      redirect_uri: opts.redirectUri ?? this.config.redirectUri,
    });
    return { id_token: tokens.id_token };
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
    const client = new google.auth.OAuth2(this.config.clientId, this.config.clientSecret);
    const ticket = await client.verifyIdToken({ idToken, audience: this.config.clientId });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('ID token has no payload');
    return payload as unknown as GoogleIdTokenClaims;
  }
}

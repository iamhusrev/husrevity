import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiException } from '../common/api.exception';
import { GOOGLE_LOGIN_GATEWAY, GoogleIdTokenClaims, GoogleLoginGateway } from './google-login.gateway';

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
}

export interface IdTokenExpectations {
  clientId: string;
  /** SHA-256 hex of the nonce this flow sent to Google. */
  nonceHash: string;
  /** Test hook, defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Validates a Google ID token. The gateway verifies the signature; this class
 * independently checks every claim the sign-in depends on (aud, iss, exp,
 * nonce, email_verified, sub, email) so a gateway that is lax on one of them
 * cannot let a bad token through. All failures are 401 with one generic
 * message (no oracle); the specific reason is logged without the token.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  private readonly logger = new Logger(GoogleIdTokenVerifier.name);

  constructor(@Inject(GOOGLE_LOGIN_GATEWAY) private readonly gateway: GoogleLoginGateway) {}

  async verify(idToken: string, expect: IdTokenExpectations): Promise<VerifiedGoogleIdentity> {
    let claims: GoogleIdTokenClaims;
    try {
      claims = await this.gateway.verifyIdToken(idToken);
    } catch {
      return this.reject('signature');
    }

    const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!aud.includes(expect.clientId)) return this.reject('aud');
    if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) return this.reject('iss');
    const nowMs = expect.nowMs ?? Date.now();
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return this.reject('exp');
    if (!claims.nonce || sha256Hex(claims.nonce) !== expect.nonceHash) return this.reject('nonce');
    if (claims.email_verified !== true && claims.email_verified !== 'true') {
      return this.reject('email_verified');
    }
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) {
      return this.reject('sub');
    }
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase().trim() : '';
    if (!email || !email.includes('@') || email.length > 160) return this.reject('email');

    return {
      sub: claims.sub,
      email,
      givenName: claims.given_name ? String(claims.given_name).slice(0, 80) : null,
      familyName: claims.family_name ? String(claims.family_name).slice(0, 80) : null,
    };
  }

  private reject(reason: string): never {
    this.logger.warn(`Google ID token rejected: ${reason}`);
    throw ApiException.unauthorized('Google sign-in could not be verified');
  }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

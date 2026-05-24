import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../common/current-user.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  iss?: string;
}

/**
 * Mirrors com.husrevity.auth.JwtAuthFilter + JwtService.parse.
 * Passport runs this on every request that needs auth (default behavior because
 * JwtAuthGuard is the global APP_GUARD). validate() return value becomes req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('HUSREVITY_JWT_SECRET');
    if (!secret || secret.startsWith('replace-')) {
      throw new Error(
        'HUSREVITY_JWT_SECRET missing or placeholder. Generate: openssl rand -base64 48',
      );
    }
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('HUSREVITY_JWT_SECRET must be at least 32 bytes');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: config.get<string>('HUSREVITY_JWT_ISSUER') ?? 'husrevity-nest',
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: String(payload.sub),
      email: payload.email,
      role: payload.role ?? 'user',
    };
  }
}

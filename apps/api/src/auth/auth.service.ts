import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { User } from '../user/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { ApiException } from '../common/api.exception';
import { UserDto } from '../user/user.dto';
import {
  AuthResponseDto,
  LoginRequestDto,
  RefreshRequestDto,
  RegisterRequestDto,
} from './dto/auth-dtos';

/**
 * Port of com.husrevity.auth.AuthService.
 * - register: creates User, issues access+refresh.
 * - login: validates creds, issues tokens.
 * - refresh: rotates refresh token (revoke old, issue new pair).
 * - logout: revokes all refresh tokens for the user.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async register(req: RegisterRequestDto): Promise<AuthResponseDto> {
    const email = req.email.toLowerCase().trim();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw ApiException.conflict('Email already registered');

    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(req.password, 10),
      firstName: req.firstName ?? null,
      lastName: req.lastName ?? null,
      enabled: true,
    });
    const saved = await this.users.save(user);
    return this.issueTokens(saved);
  }

  async login(req: LoginRequestDto): Promise<AuthResponseDto> {
    const email = req.email.toLowerCase().trim();
    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.enabled) throw ApiException.unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(req.password, user.passwordHash);
    if (!ok) throw ApiException.unauthorized('Invalid credentials');
    return this.issueTokens(user);
  }

  async refresh(req: RefreshRequestDto): Promise<AuthResponseDto> {
    const hash = this.sha256(req.refreshToken);
    const token = await this.refreshTokens.findOne({ where: { tokenHash: hash } });
    if (!token || token.revoked || token.expiresAt.getTime() < Date.now()) {
      throw ApiException.unauthorized('Invalid or expired refresh token');
    }
    const user = await this.users.findOne({ where: { id: token.userId } });
    if (!user || !user.enabled) throw ApiException.unauthorized('User disabled');

    return this.dataSource.transaction(async (em) => {
      token.revoked = true;
      await em.save(token);
      return this.issueTokensWithEm(em, user);
    });
  }

  async logout(userId: string): Promise<void> {
    await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked: true })
      .where('user_id = :userId AND revoked = false', { userId })
      .execute();
  }

  private async issueTokens(user: User): Promise<AuthResponseDto> {
    return this.dataSource.transaction((em) => this.issueTokensWithEm(em, user));
  }

  /**
   * Public hook for sibling services (e.g. AdminService.acceptInvite) that
   * need to mint tokens for a user they just created.
   */
  async issueTokensFor(user: User): Promise<AuthResponseDto> {
    return this.issueTokens(user);
  }

  private async issueTokensWithEm(
    em: import('typeorm').EntityManager,
    user: User,
  ): Promise<AuthResponseDto> {
    const accessTtlMin = Number(this.config.get('HUSREVITY_JWT_ACCESS_TTL_MIN') ?? 15);
    const refreshTtlDays = Number(this.config.get('HUSREVITY_JWT_REFRESH_TTL_DAYS') ?? 4);
    const issuer = this.config.get<string>('HUSREVITY_JWT_ISSUER') ?? 'husrevity-nest';

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      { expiresIn: `${accessTtlMin}m`, issuer },
    );

    const refreshRaw = randomBytes(48).toString('base64url');
    const refreshHash = this.sha256(refreshRaw);
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);

    const rt = em.create(RefreshToken, {
      tokenHash: refreshHash,
      userId: user.id,
      expiresAt,
      revoked: false,
    });
    await em.save(rt);

    return {
      accessToken,
      refreshToken: refreshRaw,
      user: UserDto.from(user),
    };
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupRefreshTokens(): Promise<void> {
    const result = await this.refreshTokens
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('expires_at < NOW() OR revoked = true')
      .execute();
    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} expired/revoked refresh token(s)`);
    }
  }
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ProjectInviteRegisterController } from './project-invite-register.controller';
import { JwtStrategy } from './jwt.strategy';
import { RefreshToken } from './refresh-token.entity';
import { PersonalAccessToken } from './personal-access-token.entity';
import { PatService } from './pat.service';
import { PatController } from './pat.controller';
import { UserIdentity } from './user-identity.entity';
import { OAuthFlow } from './oauth-flow.entity';
import { GoogleLoginController } from './google-login.controller';
import { GoogleLoginService } from './google-login.service';
import { GoogleLoginConfig } from './google-login.config';
import { GoogleIdTokenVerifier } from './google-id-token.verifier';
import { GOOGLE_LOGIN_GATEWAY, GoogleOAuthLoginGateway } from './google-login.gateway';
import { UserModule } from '../user/user.module';
import { ProjectModule } from '../project/project.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [
    UserModule,
    CryptoModule,
    TypeOrmModule.forFeature([RefreshToken, PersonalAccessToken, UserIdentity, OAuthFlow]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('HUSREVITY_JWT_SECRET'),
      }),
    }),
    // One-directional: AuthModule -> ProjectModule, never the reverse — see
    // project-invite-register.controller.ts for the full rationale.
    ProjectModule,
  ],
  controllers: [
    AuthController,
    ProjectInviteRegisterController,
    PatController,
    GoogleLoginController,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    PatService,
    GoogleLoginConfig,
    GoogleIdTokenVerifier,
    GoogleLoginService,
    { provide: GOOGLE_LOGIN_GATEWAY, useClass: GoogleOAuthLoginGateway },
  ],
  exports: [AuthService, PatService],
})
export class AuthModule {}

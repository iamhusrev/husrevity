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
import { UserModule } from '../user/user.module';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([RefreshToken, PersonalAccessToken]),
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
  controllers: [AuthController, ProjectInviteRegisterController, PatController],
  providers: [AuthService, JwtStrategy, PatService],
  exports: [AuthService, PatService],
})
export class AuthModule {}

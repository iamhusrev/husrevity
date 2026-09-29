import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationAccount } from './integration-account.entity';
import { ExternalLink } from './external-link.entity';
import { Item } from '../item/item.entity';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GcalWebhookController } from './gcal-webhook.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarSyncJobService } from './google-calendar-sync-job.service';
import { GcalWatchRenewalService } from './gcal-watch-renewal.service';
import { CryptoModule } from '../crypto/crypto.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationAccount, ExternalLink, Item]),
    CryptoModule,
    JobsModule,
    // Signs/verifies the OAuth `state` param so the callback can trust the
    // ownerId it carries instead of accepting a raw, attacker-suppliable
    // value (the callback route is @Public() and unauthenticated).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('HUSREVITY_JWT_SECRET'),
      }),
    }),
  ],
  controllers: [GoogleCalendarController, GcalWebhookController],
  providers: [
    GoogleCalendarConfig,
    IntegrationAccountService,
    GoogleCalendarService,
    GoogleCalendarSyncService,
    GoogleCalendarSyncJobService,
    GcalWatchRenewalService,
  ],
  exports: [
    GoogleCalendarConfig,
    IntegrationAccountService,
    GoogleCalendarService,
    GoogleCalendarSyncService,
    GoogleCalendarSyncJobService,
    GcalWatchRenewalService,
  ],
})
export class IntegrationsModule {}

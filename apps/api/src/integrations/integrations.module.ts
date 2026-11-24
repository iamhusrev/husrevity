import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationAccount } from './integration-account.entity';
import { ExternalLink } from './external-link.entity';
import { OAuthFlow } from '../auth/oauth-flow.entity';
import { Item } from '../item/item.entity';
import { GoogleCalendarConnection } from './google-calendar-connection.entity';
import { GoogleCalendarSubscription } from './google-calendar-subscription.entity';
import { GoogleCalendarChannel } from './google-calendar-channel.entity';
import { GoogleCalendarEvent } from './google-calendar-event.entity';
import { GoogleCalendarPublication } from './google-calendar-publication.entity';
import { GOOGLE_CALENDAR_GATEWAY, GoogleApiCalendarGateway } from './google-calendar-gateway';
import { GoogleCalendarSelectionService } from './google-calendar-selection.service';
import { GoogleCalendarV2Controller } from './google-calendar-v2.controller';
import { GOOGLE_EVENTS_READER, GoogleApiEventsReader } from './google-events-reader';
import { GoogleCalendarReadSyncService } from './google-calendar-read-sync.service';
import { GoogleCalendarPublishService } from './google-calendar-publish.service';
import { GoogleCalendarEngineService } from './google-calendar-engine.service';
import { GoogleCalendarWriteService } from './google-calendar-write.service';
import { GoogleCalendarLifecycleService } from './google-calendar-lifecycle.service';
import { GoogleCalendarLifecycleJobService } from './google-calendar-lifecycle-job.service';
import { GoogleCalendarReadSyncJobService } from './google-calendar-read-sync-job.service';
import { GoogleCalendarConfig } from './google-calendar.config';
import { IntegrationAccountService } from './integration-account.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GcalWebhookController } from './gcal-webhook.controller';
import { GoogleCalendarConnectService } from './google-calendar-connect.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarSyncJobService } from './google-calendar-sync-job.service';
import { GcalWatchRenewalService } from './gcal-watch-renewal.service';
import { CryptoModule } from '../crypto/crypto.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntegrationAccount,
      ExternalLink,
      Item,
      OAuthFlow,
      GoogleCalendarConnection,
      GoogleCalendarSubscription,
      GoogleCalendarChannel,
      GoogleCalendarEvent,
      GoogleCalendarPublication,
    ]),
    CryptoModule,
    JobsModule,
  ],
  controllers: [GoogleCalendarController, GoogleCalendarV2Controller, GcalWebhookController],
  providers: [
    GoogleCalendarConfig,
    IntegrationAccountService,
    GoogleCalendarService,
    GoogleCalendarConnectService,
    GoogleCalendarSyncService,
    GoogleCalendarSyncJobService,
    GcalWatchRenewalService,
    { provide: GOOGLE_EVENTS_READER, useClass: GoogleApiEventsReader },
    GoogleCalendarReadSyncService,
    GoogleCalendarReadSyncJobService,
    { provide: GOOGLE_CALENDAR_GATEWAY, useClass: GoogleApiCalendarGateway },
    GoogleCalendarSelectionService,
    GoogleCalendarLifecycleService,
    GoogleCalendarLifecycleJobService,
    GoogleCalendarPublishService,
    GoogleCalendarWriteService,
    GoogleCalendarEngineService,
  ],
  exports: [
    GoogleCalendarConfig,
    IntegrationAccountService,
    GoogleCalendarService,
    GoogleCalendarSyncService,
    GoogleCalendarSyncJobService,
    GcalWatchRenewalService,
    GoogleCalendarReadSyncService,
    GoogleCalendarPublishService,
    GoogleCalendarEngineService,
  ],
})
export class IntegrationsModule {}

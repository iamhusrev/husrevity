import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailAccount } from './gmail-account.entity';
import { GmailMessage } from './gmail-message.entity';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { GmailOAuthController } from './gmail-oauth.controller';
import { GmailOAuthService } from './gmail-oauth.service';
import { GmailTokenService } from './gmail-token.service';
import { GoogleOAuthConfig } from './google-oauth.config';
import { MicrosoftOAuthConfig } from './microsoft-oauth.config';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleContactsService } from './google-contacts.service';
import { GoogleDriveService } from './google-drive.service';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { GoogleDataController } from './google-data.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GmailAccount, GmailMessage])],
  providers: [
    GoogleOAuthConfig,
    MicrosoftOAuthConfig,
    GmailTokenService,
    GmailOAuthService,
    GmailService,
    GoogleCalendarService,
    GoogleContactsService,
    GoogleDriveService,
    MicrosoftGraphService,
  ],
  controllers: [GmailController, GmailOAuthController, GoogleDataController],
})
export class GmailModule {}

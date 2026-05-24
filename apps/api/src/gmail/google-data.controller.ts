import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleContactsService } from './google-contacts.service';
import { GoogleDriveService } from './google-drive.service';
import {
  GoogleCalendarEventDto,
  GoogleContactDto,
  GoogleDriveFileDto,
} from './dto/gmail-dtos';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

/**
 * Read-only Calendar + Contacts for a connected Gmail account.
 * Same OAuth grant as Gmail — needs calendar.readonly / contacts.readonly scope
 * (the account must be reconnected once after the scope expansion).
 */
@ApiTags('gmail-google-data')
@ApiBearerAuth()
@Controller('gmail/accounts/:id')
export class GoogleDataController {
  constructor(
    private readonly calendar: GoogleCalendarService,
    private readonly contacts: GoogleContactsService,
    private readonly drive: GoogleDriveService,
  ) {}

  @Get('calendar')
  listCalendar(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<GoogleCalendarEventDto[]> {
    return this.calendar.listEvents(u.userId, id, from, to);
  }

  @Get('contacts')
  listContacts(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GoogleContactDto[]> {
    return this.contacts.listContacts(u.userId, id);
  }

  @Get('drive')
  listDrive(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('q') q?: string,
  ): Promise<GoogleDriveFileDto[]> {
    return this.drive.listFiles(u.userId, id, q);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { GmailAccount } from './gmail-account.entity';
import { GmailTokenService } from './gmail-token.service';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { ApiException } from '../common/api.exception';
import { GoogleContactDto } from './dto/gmail-dtos';

/**
 * Read-only Google Contacts (People API) for a connected Gmail account.
 * Reuses the account's OAuth tokens. Requires contacts.readonly scope.
 */
@Injectable()
export class GoogleContactsService {
  private readonly logger = new Logger(GoogleContactsService.name);

  constructor(
    @InjectRepository(GmailAccount)
    private readonly accounts: Repository<GmailAccount>,
    private readonly tokens: GmailTokenService,
    private readonly ms: MicrosoftGraphService,
  ) {}

  async listContacts(ownerId: string, accountId: string): Promise<GoogleContactDto[]> {
    const account = await this.requireAccount(ownerId, accountId);
    if (account.provider === 'microsoft') return this.ms.listContacts(account);
    const accessToken = await this.tokens.freshAccessToken(account);
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    const people = google.people({ version: 'v1', auth: oauth2 });

    try {
      const out: GoogleContactDto[] = [];
      let pageToken: string | undefined;
      do {
        const r = await people.people.connections.list({
          resourceName: 'people/me',
          pageSize: 200,
          personFields: 'names,emailAddresses,phoneNumbers,photos',
          pageToken,
        });
        for (const p of r.data.connections ?? []) {
          out.push({
            id: p.resourceName ?? '',
            accountId: account.id,
            accountEmail: account.email,
            name: p.names?.[0]?.displayName ?? null,
            email: p.emailAddresses?.[0]?.value ?? null,
            phone: p.phoneNumbers?.[0]?.value ?? null,
            photoUrl: p.photos?.[0]?.url ?? null,
          });
        }
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken && out.length < 1000);
      out.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      return out;
    } catch (e) {
      this.logger.error('Google People list failed', e as Error);
      throw ApiException.badRequest(
        `Contacts fetch failed (reconnect the account to grant Contacts access?): ${
          (e as Error).message
        }`,
      );
    }
  }

  private async requireAccount(ownerId: string, accountId: string): Promise<GmailAccount> {
    if (!/^\d+$/.test(accountId)) throw ApiException.badRequest('Invalid account id');
    const a = await this.accounts.findOne({ where: { id: accountId, ownerId } });
    if (!a) throw ApiException.notFound('Gmail account not found');
    return a;
  }
}

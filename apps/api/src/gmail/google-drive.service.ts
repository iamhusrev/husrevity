import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { GmailAccount } from './gmail-account.entity';
import { GmailTokenService } from './gmail-token.service';
import { ApiException } from '../common/api.exception';
import { GoogleDriveFileDto } from './dto/gmail-dtos';

/**
 * Read-only Google Drive listing for a connected Google account. Reuses the
 * account's OAuth tokens (no separate consent). Requires the drive.readonly
 * scope on the grant. Google-only (Microsoft accounts are rejected).
 */
@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    @InjectRepository(GmailAccount)
    private readonly accounts: Repository<GmailAccount>,
    private readonly tokens: GmailTokenService,
  ) {}

  async listFiles(
    ownerId: string,
    accountId: string,
    search?: string,
  ): Promise<GoogleDriveFileDto[]> {
    const account = await this.requireAccount(ownerId, accountId);
    if (account.provider !== 'google') {
      throw ApiException.badRequest('Drive is only available for Google accounts');
    }
    const accessToken = await this.tokens.freshAccessToken(account);
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2 });

    let q = 'trashed = false';
    if (search && search.trim()) {
      q += ` and name contains '${search.trim().replace(/'/g, "\\'")}'`;
    }

    try {
      const r = await drive.files.list({
        q,
        pageSize: 100,
        orderBy: 'modifiedTime desc',
        fields: 'files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink)',
        spaces: 'drive',
      });
      return (r.data.files ?? []).map((f) => ({
        id: f.id ?? '',
        accountId: account.id,
        accountEmail: account.email,
        name: f.name ?? '(untitled)',
        mimeType: f.mimeType ?? null,
        modifiedTime: f.modifiedTime ?? null,
        size: f.size ?? null,
        iconLink: f.iconLink ?? null,
        webViewLink: f.webViewLink ?? null,
      }));
    } catch (e) {
      this.logger.error('Google Drive list failed', e as Error);
      throw ApiException.badRequest(
        `Drive fetch failed (reconnect the account to grant Drive access?): ${
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

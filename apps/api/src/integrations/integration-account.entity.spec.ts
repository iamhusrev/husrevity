import {
  IntegrationAccount,
  IntegrationProvider,
  IntegrationStatus,
} from './integration-account.entity';

describe('IntegrationAccount Entity', () => {
  it('should instantiate correctly with required fields', () => {
    const account = new IntegrationAccount();
    account.ownerId = '1';
    account.provider = 'google_calendar' as IntegrationProvider;
    account.encryptedAccessToken = 'encrypted-access';
    account.encryptedRefreshToken = 'encrypted-refresh';
    account.scopes = ['https://www.googleapis.com/auth/calendar'];
    account.status = 'connected' as IntegrationStatus;
    account.syncToken = 'sync-123';
    account.calendarId = 'cal-456';
    account.connectedAt = new Date();
    account.lastSyncAt = null;

    expect(account.ownerId).toBe('1');
    expect(account.provider).toBe('google_calendar');
    expect(account.encryptedAccessToken).toBe('encrypted-access');
    expect(account.encryptedRefreshToken).toBe('encrypted-refresh');
    expect(account.scopes).toEqual(['https://www.googleapis.com/auth/calendar']);
    expect(account.status).toBe('connected');
    expect(account.syncToken).toBe('sync-123');
    expect(account.calendarId).toBe('cal-456');
    expect(account.lastSyncAt).toBeNull();
  });
});

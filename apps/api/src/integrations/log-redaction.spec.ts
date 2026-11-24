import { redactSecrets } from './log-redaction';

describe('redactSecrets', () => {
  it('masks bearer, Google access and refresh tokens', () => {
    const text = redactSecrets(
      'GET failed Authorization: Bearer abc.def-ghi ya29.A0-secret-value 1//0g-refresh-token-value-123456',
    );
    expect(text).not.toContain('abc.def-ghi');
    expect(text).not.toContain('ya29.A0-secret-value');
    expect(text).not.toContain('1//0g-refresh-token-value-123456');
  });

  it('masks keyed values but keeps the key for readability', () => {
    expect(redactSecrets('refresh_token=sekret-value-1234 other=ok')).toBe(
      'refresh_token=[redacted] other=ok',
    );
    expect(redactSecrets('syncToken: CPDAlvWDx70DEPDAlvW')).toContain('syncToken: [redacted]');
  });

  it('leaves ordinary text alone and handles non-strings', () => {
    expect(redactSecrets('Calendar not found')).toBe('Calendar not found');
    expect(redactSecrets(new Error('boom'))).toBe('boom');
    expect(redactSecrets(undefined)).toBe('');
  });
});

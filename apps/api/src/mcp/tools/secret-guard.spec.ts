import { looksLikeSecret } from './secret-guard';

describe('looksLikeSecret', () => {
  describe('refuses credential-looking text', () => {
    it.each([
      'password: hunter2',
      'Password = Abc12345',
      'parola: kedi123',
      'şifre: kedi',
      'ŞİFRE: Kedi123',
      'wifi şifresi: 12345678',
      'my api key is sk-abc123def456',
      'api_key=AKIAIOSFODNN7EXAMPLE',
      'API KEY: abc',
      'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl',
      'token: hunter2',
      'token = sk-abc1234567890',
      'secret: correcthorse',
      'şifre hunter2x',
      'parola 123456',
      'token Zx9!Qw8@Er',
      'bunu kaydet aB3dE5gH7jK9mN2pQ4rS6tU8vW0xY1zZ',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'AKIAIOSFODNN7EXAMPLE',
      'sk-proj_abcdefghijklmnop1234',
      'xoxb-123456789012-abcdefghij',
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      '-----BEGIN RSA PRIVATE KEY----- MIIEow',
      'bearer: eyJhbGciOiJIUzI1NiJ9.abc.def',
      'client_secret = MySecretKey123',
      'private_key: 123456789',
      "şifre'm: hunter2",
      'auth token: 998877',
      'access_token: secretToken1',
      // L1 additions
      'pw: hunter2',
      'credentials: user admin pass Xk9!mQ2z',
      'pin: 4821',
      'passphrase=abc',
      'pass: mysecretpass',
      'kimlik bilgisi: 12345678901',
      'kimlik bilgisi = gizli123',
      '4a8b16c32d64e128f256a512b1024c20',
      'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      'a3b4c5d6e7f8g9h0i1j2k3l4',
    ])('refuses %j', (text) => {
      expect(looksLikeSecret(text)).toBe(true);
    });
  });

  describe('allows ordinary planning text (including bus / transit tokens)', () => {
    it.each([
      'yarın 9da HGS kontrol',
      'Şifre yenile',
      'Wifi şifresini değiştir',
      'password manager araştır',
      'secret santa hediyesi al',
      'token ekonomisi hakkında not al',
      'token 5 kez dene',
      'parola politikasını gözden geçir',
      'otobüs için token al',
      'otobüs için token: bilet al',
      'otobüs tokeni: bilet al',
      'a token is needed for the bus',
      'the token is for the bus',
      'bus token: buy at kiosk',
      'bus token is required for the ride',
      'metro için token ise gişeden alınır',
      'oyun için 3 token al',
      'token sayısı: 500',
      'https://example.com/a/very/long/path/with-slug-2026-10-13-weekly-planning',
      '2026-10-13-weekly-planning-meeting-notes-draft',
      'Haftalık planlama toplantısı hazırlıkları ve sunum taslağı',
      // L1 additions
      'Pay the electricity bill',
      'buy a bus ticket token for Friday',
      'password manager review',
      'ProjectPlanReviewMeeting',
      '',
    ])('allows %j', (text) => {
      expect(looksLikeSecret(text)).toBe(false);
    });
  });

  describe('documented edge cases and heuristic boundaries', () => {
    it('documents conservative false-negative boundary: unlabelled 10-char word without symbols/digits is not caught', () => {
      // "correcthorse" on its own without a keyword looks like an ordinary dictionary word
      expect(looksLikeSecret('correcthorse')).toBe(false);
      // But with an explicit secret keyword assignment it is caught:
      expect(looksLikeSecret('secret: correcthorse')).toBe(true);
    });

    it('documents false-positive minimization: token followed by dictionary word assignment is allowed', () => {
      expect(looksLikeSecret('bus token: station')).toBe(false);
      // While token followed by credential-shaped string is caught:
      expect(looksLikeSecret('token: station123')).toBe(true);
    });
  });
});

import * as secretGuard from './secret-guard';

describe('looksLikeSecretInFields: cross-field behaviour (review N1, N3)', () => {
  const { looksLikeSecret, looksLikeSecretInFields } = secretGuard;

  it('does not refuse ordinary title + notes where the title merely ends in a keyword-like word', () => {
    expect(looksLikeSecretInFields('Boarding pass', 'Gate B12')).toBe(false);
    expect(looksLikeSecretInFields('Renew bus pass', 'Platform 4, ask the desk')).toBe(false);
    expect(looksLikeSecretInFields('Season pass', '2026 renewal at the club')).toBe(false);
    expect(looksLikeSecretInFields('Review the PIN', 'policy document')).toBe(false);
  });

  it('still refuses a keyword in one field and a credential-looking value in the next', () => {
    expect(looksLikeSecretInFields('Wifi password', 'hunter2x')).toBe(true);
    expect(looksLikeSecretInFields('api key', 'Xk9mQ2zLpA81')).toBe(true);
    expect(looksLikeSecretInFields('şifre', '482913')).toBe(true);
    expect(looksLikeSecretInFields('Server login', 'pw: hunter2')).toBe(true);
  });

  it('checks every keyword occurrence, not only the first match', () => {
    expect(looksLikeSecret('pass through the gate; secret Xk9mQ2zLpA')).toBe(true);
    expect(looksLikeSecret('token talk later, token: Ab12Cd34Ef56')).toBe(true);
  });

  it('keeps accepting ordinary sentences', () => {
    expect(looksLikeSecret('pass through the gate and take a bus token to the station')).toBe(
      false,
    );
    expect(looksLikeSecret('password manager review on Friday')).toBe(false);
  });
});

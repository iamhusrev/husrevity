import { FakeGoogleGateway, FakeIdTokenClaims } from '../integrations/testing/fake-google-gateway';
import { GoogleIdTokenVerifier, sha256Hex } from './google-id-token.verifier';

const CLIENT_ID = 'client-id.example.test';
const NONCE = 'nonce-value-for-this-flow';

describe('id_token_rejects_bad_claims', () => {
  let fake: FakeGoogleGateway;
  let verifier: GoogleIdTokenVerifier;
  const expectations = { clientId: CLIENT_ID, nonceHash: sha256Hex(NONCE) };

  const good = (): FakeIdTokenClaims => ({
    sub: 'google-sub-1',
    email: 'Person@Example.test',
    email_verified: true,
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: NONCE,
  });

  const run = async (claims: FakeIdTokenClaims | null) => {
    if (claims) fake.registerIdToken('tok', claims);
    return verifier.verify('tok', expectations);
  };

  beforeEach(() => {
    fake = new FakeGoogleGateway();
    verifier = new GoogleIdTokenVerifier(fake);
  });

  it('accepts a fully valid token and normalises the e-mail', async () => {
    await expect(run(good())).resolves.toMatchObject({
      sub: 'google-sub-1',
      email: 'person@example.test',
    });
  });

  it('accepts the bare accounts.google.com issuer and an audience list containing the client', async () => {
    await expect(
      run({ ...good(), iss: 'accounts.google.com', aud: ['other', CLIENT_ID] as unknown as string }),
    ).resolves.toBeDefined();
  });

  it('rejects a token the gateway cannot verify (bad signature)', async () => {
    await expect(run(null)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a wrong audience', async () => {
    await expect(run({ ...good(), aud: 'someone-else.example.test' })).rejects.toMatchObject({ status: 401 });
    await expect(run({ ...good(), aud: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a wrong or missing issuer', async () => {
    await expect(run({ ...good(), iss: 'https://evil.example.test' })).rejects.toMatchObject({ status: 401 });
    await expect(run({ ...good(), iss: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an expired or missing exp', async () => {
    await expect(run({ ...good(), exp: Math.floor(Date.now() / 1000) - 5 })).rejects.toMatchObject({ status: 401 });
    await expect(run({ ...good(), exp: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a nonce that does not match the flow', async () => {
    await expect(run({ ...good(), nonce: 'different' })).rejects.toMatchObject({ status: 401 });
    await expect(run({ ...good(), nonce: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects email_verified other than true', async () => {
    await expect(run({ ...good(), email_verified: false })).rejects.toMatchObject({ status: 401 });
    await expect(run({ ...good(), email_verified: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a missing sub or e-mail', async () => {
    await expect(run({ ...good(), sub: '' })).rejects.toMatchObject({ status: 401 });
    await expect(run({ ...good(), email: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it('never reveals which claim failed', async () => {
    const messages = new Set<string>();
    for (const bad of [{ aud: 'x' }, { iss: 'x' }, { nonce: 'x' }, { email_verified: false }]) {
      await run({ ...good(), ...bad }).catch((e) => messages.add(e.message));
    }
    expect(messages.size).toBe(1);
  });
});

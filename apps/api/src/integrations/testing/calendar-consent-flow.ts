import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

/**
 * Test helpers for the browser-bound calendar consent flow of the integration
 * specs: PKCE pair held by the "web", the Google redirect to the callback and
 * the Bearer-authenticated exchange that finally stores the tokens.
 */
export const CALENDAR_BASE = '/api/integrations/google-calendar';

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Parameters of the web URL fragment the callback redirected to (`#code=...` or `#error=...`). */
export function fragmentOf(res: request.Response): URLSearchParams {
  const location = String(res.headers.location ?? '');
  const hash = location.includes('#') ? location.slice(location.indexOf('#') + 1) : '';
  return new URLSearchParams(hash);
}

export function exchange(
  server: Parameters<typeof request>[0],
  bearer: string | null,
  body: { code: string; verifier: string },
) {
  const req = request(server).post(`${CALENDAR_BASE}/exchange`);
  return (bearer ? req.set({ Authorization: `Bearer ${bearer}` }) : req).send(body);
}

export interface ConsentResult {
  callback: request.Response;
  /** Null when the callback produced no handoff code (denied, forged, replayed). */
  exchange: request.Response | null;
  /** True only when the exchange answered 200 with connected: true. */
  connected: boolean;
}

/** Google redirects the browser to the callback; the web then exchanges the handoff code. */
export async function finishConsent(
  server: Parameters<typeof request>[0],
  opts: {
    bearer: string;
    state: string;
    cookie: string | null;
    verifier: string;
    query: Record<string, string>;
  },
): Promise<ConsentResult> {
  const cb = await request(server)
    .get(`${CALENDAR_BASE}/callback`)
    .query({ state: opts.state, ...opts.query })
    .set(opts.cookie ? { Cookie: opts.cookie } : {});
  const handoff = fragmentOf(cb).get('code');
  if (!handoff) return { callback: cb, exchange: null, connected: false };
  const ex = await exchange(server, opts.bearer, { code: handoff, verifier: opts.verifier });
  return { callback: cb, exchange: ex, connected: ex.status === 200 && ex.body?.data?.connected === true };
}

/** HTTP status of a Google/fake error, or undefined when it carries none. */
export function googleErrorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [e?.status, e?.code, e?.response?.status]) {
    if (typeof v === 'number') return v;
  }
  return undefined;
}

/** Message of the error thrown when the Google client id/secret/redirect are missing. */
export const GOOGLE_NOT_CONFIGURED_MESSAGE = 'Google Calendar integration is not configured';

/** True for the "integration is not configured" error: a deployment state, not a Google answer. */
export function isGoogleNotConfiguredError(err: unknown): boolean {
  return (err as { message?: unknown } | null)?.message === GOOGLE_NOT_CONFIGURED_MESSAGE ||
    (err as { response?: { message?: unknown } } | null)?.response?.message === GOOGLE_NOT_CONFIGURED_MESSAGE;
}

/** `errors[0].reason` of a googleapis error (also looked up in the raw response body). */
export function googleErrorReason(err: unknown): string | undefined {
  const e = err as {
    errors?: { reason?: unknown }[];
    response?: { data?: { error?: { errors?: { reason?: unknown }[] } } };
  };
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason;
  return typeof reason === 'string' ? reason : undefined;
}

/** 403 reasons that mean the credential or its scopes are wrong (as opposed to quota or a single calendar). */
const AUTH_FORBIDDEN_REASONS = new Set([
  'insufficientPermissions',
  'authError',
  'insufficientScopes',
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
]);

/**
 * True only for a DEFINITE credential failure: Google answered `invalid_grant` (the refresh token was
 * revoked or expired), 401, or 403 with an auth/insufficient-scope reason. Rate limits (`rateLimitExceeded`,
 * `userRateLimitExceeded`, `dailyLimitExceeded`), a single forbidden or missing calendar and server errors
 * are NOT definite: they must never disconnect the account.
 */
export function isDefiniteAuthFailure(err: unknown): boolean {
  const e = err as { message?: unknown; response?: { data?: { error?: unknown } } };
  const data = e?.response?.data?.error;
  if (typeof e?.message === 'string' && e.message.startsWith('invalid_grant')) return true;
  if (data === 'invalid_grant') return true;
  const status = googleErrorStatus(err);
  if (status === 401) return true;
  if (status === 403) {
    const reason = googleErrorReason(err);
    return reason !== undefined && AUTH_FORBIDDEN_REASONS.has(reason);
  }
  return false;
}

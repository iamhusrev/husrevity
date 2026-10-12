import { PatScope } from '../../auth/personal-access-token.entity';

export interface McpExtra {
  authInfo?: {
    scopes?: string[];
    extra?: { ownerId?: string | number };
  };
}

function requireOwner(extra: McpExtra | undefined): { ownerId: string; scopes: string[] } {
  const authInfo = extra?.authInfo;
  if (!authInfo || !authInfo.extra?.ownerId) {
    throw new Error('Unauthorized: missing owner context');
  }
  return { ownerId: String(authInfo.extra.ownerId), scopes: authInfo.scopes ?? [] };
}

/** Requires EVERY listed scope. Throws `Unauthorized`/`Forbidden` errors surfaced to the MCP client. */
export function getOwnerAndCheckScope(
  extra: McpExtra | undefined,
  requiredScopes: PatScope | PatScope[],
): { ownerId: string; scopes: string[] } {
  const { ownerId, scopes } = requireOwner(extra);
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];
  for (const s of required) {
    if (!scopes.includes(s)) {
      throw new Error(`Forbidden: missing required scope '${s}'`);
    }
  }
  return { ownerId, scopes };
}

/**
 * Requires AT LEAST ONE of the listed scopes. Used where a tool moved to a per-domain scope
 * but must keep honouring a legacy scope so existing tokens continue to work.
 */
export function getOwnerAndCheckAnyScope(
  extra: McpExtra | undefined,
  anyOf: PatScope[],
): { ownerId: string } {
  const { ownerId, scopes } = requireOwner(extra);
  if (!anyOf.some((s) => scopes.includes(s))) {
    const [first, ...rest] = anyOf;
    throw new Error(
      `Forbidden: missing required scope '${first}'` +
        (rest.length ? ` (or ${rest.map((s) => `'${s}'`).join(', ')})` : ''),
    );
  }
  return { ownerId };
}

export function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** A tool-level failure: the MCP client sees `isError: true` with `{ error }` instead of a protocol error. */
export function toolError(message: string, extra?: Record<string, unknown>) {
  return {
    isError: true as const,
    content: [
      { type: 'text' as const, text: JSON.stringify({ error: message, ...extra }, null, 2) },
    ],
  };
}

/**
 * Resolves an entity from user-provided text by exact id, then case-insensitive name or code.
 * Fails loudly (listing candidates) instead of guessing when nothing or more than one entry matches.
 */
export function resolveByIdOrName<T extends { id: string | number; name: string; code?: string }>(
  items: T[],
  input: string,
  label: string,
): T {
  const raw = input.trim();
  const needle = raw.toLowerCase();
  const byId = items.filter((i) => String(i.id) === raw);
  const matches = byId.length
    ? byId
    : items.filter(
        (i) => i.name.toLowerCase() === needle || (i.code ?? '').toLowerCase() === needle,
      );
  if (matches.length === 0) {
    throw new Error(
      `${label} not found: '${input}'. Available: ${items.map((i) => i.name).join(', ')}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${label} '${input}' is ambiguous; pass the ID. Matches: ${matches
        .map((i) => `${i.name} (${i.id})`)
        .join(', ')}`,
    );
  }
  return matches[0];
}

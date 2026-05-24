import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  userId: string | null;
  email: string | null;
}

/**
 * Spring's AuditorAwareImpl reads the SecurityContextHolder for the current user.
 * NestJS doesn't have a global security context, so we use AsyncLocalStorage.
 * JwtStrategy enters this context on every authenticated request; AuditSubscriber reads it.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getCurrentUserId(): string | null {
  return requestContext.getStore()?.userId ?? null;
}

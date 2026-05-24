import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiException } from './api.exception';
import { AuthenticatedUser } from './current-user.decorator';
import { ROLES_KEY } from './roles.decorator';

/**
 * Reads `@Roles(...)` metadata off the handler or controller class and
 * requires the request's authenticated user to hold one of those roles.
 * Registered as APP_GUARD *after* `JwtAuthGuard` so by the time we run,
 * `req.user` is populated by JwtStrategy.
 *
 * No metadata = no role requirement → passes through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) throw ApiException.unauthorized('Authentication required');
    if (!required.includes(user.role)) {
      throw ApiException.forbidden('Insufficient role');
    }
    return true;
  }
}

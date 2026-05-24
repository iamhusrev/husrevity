import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { requestContext } from '../common/request-context';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ApiException } from '../common/api.exception';
import { Observable } from 'rxjs';

/**
 * Global guard. Skips routes flagged with @Public(); otherwise requires a valid Bearer JWT.
 * After Passport sets req.user, we enter AsyncLocalStorage so the AuditSubscriber and any
 * downstream service can resolve "who is the current user".
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(ctx: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(ctx);
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    ctx: ExecutionContext,
  ): TUser {
    if (err || !user) throw ApiException.unauthorized('Invalid or missing token');

    const req = ctx.switchToHttp().getRequest<Request>();
    const u = user as unknown as AuthenticatedUser;

    requestContext.enterWith({
      userId: u.userId,
      email: u.email,
    });

    (req as Request & { user: AuthenticatedUser }).user = u;
    return user as TUser;
  }
}

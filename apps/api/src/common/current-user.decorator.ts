import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

/**
 * Equivalent of injecting AuthenticatedUser principal in a Spring controller.
 * Usage:  fooController(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * JwtStrategy.validate() returns this object; passport attaches it to req.user.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return req.user;
  },
);

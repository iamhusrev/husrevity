import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marks a controller route as requiring one of the listed roles. Used in
 * conjunction with `RolesGuard` (registered as an APP_GUARD after
 * `JwtAuthGuard`). Without this decorator, any authenticated user passes.
 *
 *   @Roles('admin')
 *   @Get('admin/users')
 *   list() { ... }
 */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a controller route as not requiring JWT auth. JwtAuthGuard checks for this.
 * Used on /auth/register, /auth/login, /auth/refresh, /health.
 *
 * Spring equivalent: omitting from authenticated paths in SecurityConfig (permitAll).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

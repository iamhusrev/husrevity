import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

/**
 * Wraps every successful response in the same envelope the Spring API uses:
 *   { success, message, code, data }
 * The Next.js web (apps/web) parses exactly this shape (see api-client.ts there).
 *
 * Skips wrapping if the controller already returned an envelope (sniffs `success` boolean).
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data) => {
        if (data !== null && typeof data === 'object' && 'success' in (data as object)) {
          return data;
        }
        return {
          success: true,
          message: 'OK',
          code: res.statusCode,
          data: data ?? null,
        };
      }),
    );
  }
}

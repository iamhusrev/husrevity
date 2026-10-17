import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, of } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { IdempotencyKey } from './idempotency-key.entity';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * Opt-in via the `Idempotency-Key` request header — a client without one
 * (e.g. a normal web request) behaves exactly as before. An offline queue
 * retrying a POST/PATCH after a dropped response replays the original
 * response instead of re-applying the write.
 *
 * Runs INSIDE the global ResponseInterceptor (this is a controller-level
 * interceptor), so it stores/replays the raw handler return value, not the
 * `{success,message,code,data}` envelope — the global interceptor wraps
 * whatever this emits either way, on both the fresh and the replayed path.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @InjectRepository(IdempotencyKey) private readonly keys: Repository<IdempotencyKey>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const key = req.header('Idempotency-Key');
    const ownerId = req.user?.userId;
    if (!key || !ownerId) return next.handle();

    const existing = await this.keys.findOne({ where: { ownerId, key } });
    if (existing) {
      context.switchToHttp().getResponse<Response>().status(existing.responseStatus);
      // 204 was stored as the `{}` placeholder (see below); replay it as the empty response it was.
      return of(existing.responseStatus === 204 ? undefined : existing.responseBody);
    }

    return next.handle().pipe(
      // The key is persisted BEFORE the response goes out: a client that retries the moment it
      // gets the response (or after a timeout) must find the key, or the write is applied twice.
      // A failed save only costs the replay guarantee, never the response.
      concatMap(async (body) => {
        const res = context.switchToHttp().getResponse<Response>();
        try {
          await this.keys.save(
            this.keys.create({
              ownerId,
              key,
              method: req.method,
              path: req.path,
              responseStatus: res.statusCode,
              // response_body is JSONB NOT NULL, and a bodiless response (DELETE 204) has none.
              responseBody: body ?? {},
            }),
          );
        } catch (err) {
          this.logger.warn(`Failed to persist idempotency key for ${req.method} ${req.path}: ${err}`);
        }
        return body;
      }),
    );
  }
}

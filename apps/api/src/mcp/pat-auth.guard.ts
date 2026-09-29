import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PatService } from '../auth/pat.service';
import { PatScope } from '../auth/personal-access-token.entity';
import { ApiException } from '../common/api.exception';

export interface PatAuth {
  ownerId: string;
  scopes: PatScope[];
}

/**
 * Authenticates `POST /api/mcp` via `Authorization: Bearer <PAT>` (never
 * JWT — MCP clients hold a personal access token, not a user session).
 * Attaches `req.patAuth` for the route handler; does NOT check scopes —
 * `/mcp` is a single route carrying every tool call over JSON-RPC, so
 * scope requirements are necessarily per-tool, not per-route (each tool
 * handler checks `req.patAuth.scopes` itself — see mcp-server-factory.ts).
 */
@Injectable()
export class PatAuthGuard implements CanActivate {
  constructor(private readonly pat: PatService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { patAuth?: PatAuth }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw ApiException.unauthorized('Missing bearer token');

    const validated = await this.pat.validate(token);
    if (!validated) throw ApiException.unauthorized('Invalid or expired personal access token');

    req.patAuth = validated;
    return true;
  }
}

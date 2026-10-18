import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { TrashService } from '../../trash/trash.service';
import { TRASH_KINDS, TrashKind } from '../../trash/dto/trash-dtos';
import { ApiException } from '../../common/api.exception';
import { PatScope } from '../../auth/personal-access-token.entity';
import { getOwnerAndCheckAnyScope, McpExtra, textResult, toolError } from './mcp-tool-helpers';
import { looksLikeSecretInFields } from './secret-guard';

export interface TrashToolsDeps {
  trashService: TrashService;
}

/** Read scope(s) that unlock each kind; any one of them is enough. */
const KIND_SCOPES: Record<TrashKind, PatScope[]> = {
  task: ['projects:read'],
  project: ['projects:read'],
  reminder: ['reminders:read', 'items:read'],
  reminder_list: ['reminders:read', 'items:read'],
  calendar_event: ['calendar:read'],
  goal: ['goals:read'],
};

const ANY_TRASH_SCOPE: PatScope[] = [
  'projects:read',
  'calendar:read',
  'reminders:read',
  'items:read',
  'goals:read',
];

const REDACTED_TITLE = '[redacted]';
const DEFAULT_LIMIT = 20;

const kindSchema = z.enum(TRASH_KINDS);

export function registerTrashTools(server: McpServer, deps: TrashToolsDeps) {
  server.registerTool(
    'list_deleted',
    {
      description:
        'List recently deleted (restorable) entries: tasks, projects, reminders, reminder lists, ' +
        'calendar events and goals, newest deletion first. Each entry carries restoreTool (the MCP ' +
        'tool that restores it, e.g. restore_task) and restorePath (the REST PATCH route). Only ' +
        'titles are returned, never notes or descriptions. Kinds the token cannot read are omitted ' +
        'unless explicitly requested, which is then refused. Tasks of a deleted project are not ' +
        'listed on their own: restore the project instead.',
      inputSchema: {
        kind: z
          .union([kindSchema, z.array(kindSchema)])
          .optional()
          .describe('One kind or a list of kinds to include; defaults to every readable kind'),
        since: z
          .string()
          .optional()
          .describe('Only entries deleted at or after this ISO 8601 date-time'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of entries (1-100, default 20)'),
        cursor: z
          .string()
          .optional()
          .describe('nextCursor from a previous call, to fetch the next page'),
      },
    },
    async (params, extra) => {
      // Auth and scope come first; the input is not inspected until the caller is known.
      const { ownerId, scopes } = getOwnerAndCheckAnyScope(
        extra as unknown as McpExtra,
        ANY_TRASH_SCOPE,
      );
      const input = (params ?? {}) as Record<string, unknown>;
      const canRead = (kind: TrashKind) => KIND_SCOPES[kind].some((s) => scopes.includes(s));

      let kinds: TrashKind[];
      if (input.kind === undefined || input.kind === null) {
        kinds = TRASH_KINDS.filter(canRead);
      } else {
        const requested = Array.isArray(input.kind) ? input.kind : [input.kind];
        for (const k of requested) {
          if (typeof k !== 'string' || !(TRASH_KINDS as readonly string[]).includes(k)) {
            return toolError(
              `Invalid kind '${String(k)}': must be one of ${TRASH_KINDS.join(', ')}`,
            );
          }
        }
        kinds = [...new Set(requested as TrashKind[])];
        for (const k of kinds) {
          if (!canRead(k)) {
            throw new Error(
              `Forbidden: missing required scope '${KIND_SCOPES[k][0]}' for kind '${k}'`,
            );
          }
        }
      }

      let since: string | undefined;
      if (input.since !== undefined && input.since !== null) {
        if (typeof input.since !== 'string' || Number.isNaN(Date.parse(input.since))) {
          return toolError('Invalid since: must be an ISO 8601 date-time');
        }
        since = input.since;
      }

      let limit = DEFAULT_LIMIT;
      if (input.limit !== undefined && input.limit !== null) {
        if (
          typeof input.limit !== 'number' ||
          !Number.isInteger(input.limit) ||
          input.limit < 1 ||
          input.limit > 100
        ) {
          return toolError('limit must be an integer between 1 and 100');
        }
        limit = input.limit;
      }

      let cursor: string | undefined;
      if (input.cursor !== undefined && input.cursor !== null) {
        if (typeof input.cursor !== 'string' || !input.cursor) {
          return toolError('cursor must be a non-empty string');
        }
        cursor = input.cursor;
      }

      try {
        const page = await deps.trashService.list(ownerId, { kinds, since, limit, cursor });
        // Titles and project names are typed on the web without the secret guard, so both are
        // checked before anything leaves through MCP.
        const items = page.items.map((entry) => ({
          ...entry,
          title: looksLikeSecretInFields(entry.title) ? REDACTED_TITLE : entry.title,
          projectName:
            entry.projectName && looksLikeSecretInFields(entry.projectName)
              ? REDACTED_TITLE
              : entry.projectName,
        }));
        return textResult({ items, nextCursor: page.nextCursor });
      } catch (err: any) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );
}

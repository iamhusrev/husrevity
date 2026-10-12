import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { DateTime } from 'luxon';
import { parseQuickAdd } from '@husrevity/parser';
import { ItemService } from '../../item/item.service';
import { ItemRequestDto } from '../../item/dto/item-dtos';
import { ChangeSetService, extractItemSnapshot } from '../../change-set/change-set.service';
import { ApiException } from '../../common/api.exception';
import { PatScope } from '../../auth/personal-access-token.entity';
import { getOwnerAndCheckScope, McpExtra, textResult, toolError } from './mcp-tool-helpers';
import { looksLikeSecret, looksLikeSecretInFields } from './secret-guard';
import {
  ISTANBUL_ZONE,
  MAX_CONTEXT_LENGTH,
  MAX_TITLE_LENGTH,
  SECRETS_REFUSED_MESSAGE,
  validateItemFields,
} from './plan-input';

export interface CaptureToolDeps {
  itemService: ItemService;
  changeSetService: ChangeSetService;
}

export const MAX_CAPTURE_TEXT_LENGTH = 2000;

function formatIstanbul(iso: string): string {
  return DateTime.fromISO(iso).setZone(ISTANBUL_ZONE).toFormat('yyyy-MM-dd HH:mm');
}

export function registerCaptureTool(server: McpServer, deps: CaptureToolDeps) {
  server.registerTool(
    'capture',
    {
      description:
        'Capture something the owner just said ("add this to husrevity") as a native item (task, event or log). ' +
        'Pass the owner\'s words in `text`: Turkish quick-add phrases such as "yarın 9da HGS kontrol" or "her gün 7de koşu" are parsed for title, time, recurrence and #context. ' +
        'Optional structured fields override whatever the parser understood. Defaults to a task. ' +
        'The write is one undoable change set (undo_change_set). The result includes an `interpretation` string: tell the owner what was understood. ' +
        'Secrets (passwords, API keys, tokens) are refused and never stored. ' +
        'Credential-looking text is refused by design and may occasionally block innocent text.',
      inputSchema: {
        text: z
          .string()
          .max(MAX_CAPTURE_TEXT_LENGTH)
          .describe(`What the owner said, 1-${MAX_CAPTURE_TEXT_LENGTH} characters, not blank`),
        kind: z.enum(['task', 'event', 'log']).optional().describe('Item kind (default task)'),
        title: z.string().optional().describe('Explicit title; overrides the parsed title'),
        notes: z.string().optional().describe('Notes'),
        dueAt: z
          .string()
          .optional()
          .describe('Due date-time, ISO 8601 (no offset means Istanbul time)'),
        scheduledAt: z
          .string()
          .optional()
          .describe(
            'Scheduled start, ISO 8601 (no offset means Istanbul time); overrides the parsed time',
          ),
        durationMin: z.number().optional().describe('Duration in minutes (integer, 0 or more)'),
        projectId: z.string().optional().describe('Numeric project ID to attach the item to'),
        goalId: z.string().nullable().optional().describe('Numeric goal ID to attach the item to'),
        context: z
          .string()
          .optional()
          .describe(`Context tag, at most ${MAX_CONTEXT_LENGTH} characters`),
      },
    },
    async (params, extra) => {
      const input = (params ?? {}) as Record<string, unknown>;
      const requiredScopes: PatScope[] = ['items:write'];
      if (input.goalId !== undefined) {
        requiredScopes.push('goals:write');
      }
      const { ownerId } = getOwnerAndCheckScope(extra as unknown as McpExtra, requiredScopes);

      const text = input.text;
      if (typeof text !== 'string' || !text.trim()) {
        return toolError('text is required and must not be blank');
      }
      if (text.length > MAX_CAPTURE_TEXT_LENGTH) {
        return toolError(`text must be at most ${MAX_CAPTURE_TEXT_LENGTH} characters`);
      }
      if (looksLikeSecretInFields(text, input.title, input.notes, input.context)) {
        return toolError(SECRETS_REFUSED_MESSAGE);
      }

      const { errors, fields: overrides } = validateItemFields(
        {
          kind: input.kind,
          title: input.title,
          notes: input.notes,
          dueAt: input.dueAt,
          scheduledAt: input.scheduledAt,
          durationMin: input.durationMin,
          projectId: input.projectId,
          goalId: input.goalId,
          context: input.context,
        },
        { requireTitle: false, allowNull: false, allowKind: true },
      );
      if (errors.length) return toolError(errors.join('; '));

      const parsed = await parseQuickAdd(text);

      let title = overrides.title;
      let notes = overrides.notes;
      if (!title) {
        const derived = parsed.title.trim() || text.trim();
        if (derived.length > MAX_TITLE_LENGTH) {
          title = `${derived.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
          notes = notes ?? text.trim();
        } else {
          title = derived;
        }
      }

      const kind = overrides.kind ?? 'task';
      const scheduledAt = overrides.scheduledAt ?? parsed.scheduledAt;
      const dueAt = overrides.dueAt;
      const context = overrides.context ?? parsed.context?.slice(0, MAX_CONTEXT_LENGTH);
      const rrule = parsed.rrule;

      if (rrule && !scheduledAt) {
        return toolError("a recurring item needs a start time, e.g. 'every Monday at 09:00'");
      }

      const req: ItemRequestDto = { kind, title, source: 'mcp' };
      if (notes !== undefined) req.notes = notes;
      if (context) req.context = context;
      if (overrides.projectId) req.projectId = overrides.projectId;
      if (overrides.goalId) req.goalId = overrides.goalId;
      if (scheduledAt) req.scheduledAt = scheduledAt;
      if (dueAt) req.dueAt = dueAt;
      if (overrides.durationMin !== undefined) req.durationMin = overrides.durationMin;
      if (rrule) req.rrule = rrule;
      if (kind !== 'log' && (scheduledAt || dueAt)) req.notifyMinutesBefore = 0;

      try {
        const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
          ownerId,
          { source: 'mcp', label: `capture: ${title}` },
          async (csId, manager) => {
            const item = await deps.itemService.create(ownerId, req, manager);
            await deps.changeSetService.recordEntry(
              csId,
              ownerId,
              {
                targetType: 'item',
                targetId: item.id,
                op: 'create',
                before: null,
                after: extractItemSnapshot(item),
              },
              manager,
            );
            return item;
          },
        );

        const interpretation = describeCapture({
          kind,
          title,
          scheduledAt,
          scheduledFromText: overrides.scheduledAt === undefined && Boolean(parsed.scheduledAt),
          dueAt: dueAt ?? undefined,
          durationMin: overrides.durationMin,
          rrule,
          context,
          projectId: overrides.projectId ?? undefined,
          projectRef: parsed.projectRef,
          priority: parsed.priority,
        });

        return textResult({
          item: {
            id: result.id,
            kind: result.kind,
            title: result.title,
            scheduledAt: result.scheduledAt ?? null,
            dueAt: result.dueAt ?? null,
            durationMin: result.durationMin ?? null,
            context: result.context ?? null,
            projectId: result.projectId ?? null,
            goalId: result.goalId ?? null,
            rrule: result.rrule ?? null,
          },
          interpretation,
          changeSetId,
        });
      } catch (err) {
        if (err instanceof ApiException) return toolError(err.message);
        throw err;
      }
    },
  );
}

function describeCapture(d: {
  kind: string;
  title: string;
  scheduledAt?: string;
  scheduledFromText: boolean;
  dueAt?: string;
  durationMin?: number | null;
  rrule?: string;
  context?: string;
  projectId?: string | null;
  projectRef?: string;
  priority?: string;
}): string {
  const parts = [`Created a ${d.kind} "${d.title}"`];
  if (d.scheduledAt) parts.push(`scheduled for ${formatIstanbul(d.scheduledAt)} (Europe/Istanbul)`);
  if (d.dueAt) parts.push(`due ${formatIstanbul(d.dueAt)} (Europe/Istanbul)`);
  if (d.durationMin != null) parts.push(`${d.durationMin} min long`);
  if (d.rrule) parts.push(`recurring (${d.rrule})`);
  if (d.context) parts.push(`context "${d.context}"`);
  if (d.projectId) parts.push(`in project ${d.projectId}`);

  const notes: string[] = [];
  if (d.scheduledAt && d.scheduledFromText) notes.push('The time was understood from the text.');
  if (!d.scheduledAt && !d.dueAt)
    notes.push('No date or time was recognised, so the item is unscheduled.');
  if (d.projectRef && !d.projectId) {
    notes.push(
      `The project reference "@${d.projectRef}" was recognised but not resolved; pass projectId to link a project.`,
    );
  }
  if (d.priority) {
    notes.push(
      `Priority "${d.priority}" was recognised but items have no priority field, so it was ignored.`,
    );
  }
  return [`${parts.join(', ')}.`, ...notes].join(' ');
}

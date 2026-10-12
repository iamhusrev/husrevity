import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { DateTime } from 'luxon';
import { TodayService } from '../../today/today.service';
import { ItemService } from '../../item/item.service';
import { ProjectService } from '../../project/project.service';
import { GoalService } from '../../goal/goal.service';
import { ChangeSetService } from '../../change-set/change-set.service';
import { getOwnerAndCheckScope, McpExtra, textResult, toolError } from './mcp-tool-helpers';
import { ISTANBUL_ZONE } from './plan-input';

export interface LifeContextToolDeps {
  todayService: TodayService;
  itemService: ItemService;
  projectService: ProjectService;
  changeSetService: ChangeSetService;
  goalService?: GoalService;
}

const MAX_UPCOMING_ITEMS = 100;
const MAX_OVERDUE_ITEMS = 50;
const MAX_ACTIVE_PROJECTS = 20;
const MAX_ACTIVE_GOALS = 20;
const MAX_RECENT_CHANGES = 5;
const MAX_NOTE_LENGTH = 200;

function truncateNote(note: unknown): string | null {
  if (typeof note !== 'string' || !note) return null;
  return note.length > MAX_NOTE_LENGTH ? note.slice(0, MAX_NOTE_LENGTH) : note;
}

export function registerLifeContextTool(server: McpServer, deps: LifeContextToolDeps) {
  server.registerTool(
    'get_life_context',
    {
      description:
        "Fetch full life planning context for the owner in one roundtrip: today's schedule and due tasks, " +
        'upcoming items grouped per date for the next N days (default 7), overdue items, active projects (if projects:read permitted), ' +
        'and recent change sets. Read-only and owner-scoped.',
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(14)
          .optional()
          .describe('Number of upcoming days to inspect (1-14, default 7)'),
      },
    },
    async (params, extra) => {
      const { ownerId, scopes } = getOwnerAndCheckScope(extra as unknown as McpExtra, 'items:read');
      const input = (params ?? {}) as Record<string, unknown>;

      let days = 7;
      if (input.days !== undefined) {
        if (
          typeof input.days !== 'number' ||
          !Number.isInteger(input.days) ||
          input.days < 1 ||
          input.days > 14
        ) {
          return toolError('days must be an integer between 1 and 14');
        }
        days = input.days;
      }

      const now = DateTime.now().setZone(ISTANBUL_ZONE);
      const todayDateStr = now.toISODate()!;
      const startOfToday = now.startOf('day');
      const startOfTodayUtc = startOfToday.toUTC().toISO()!;

      // 1. Today section
      const timeline = await deps.todayService.timeline(ownerId);
      const dueToday = await deps.todayService.dueToday(ownerId);
      const currentBlock = deps.todayService.currentBlock(timeline);
      const today = {
        date: todayDateStr,
        timeline,
        dueToday,
        currentBlock,
      };

      // 2. Upcoming section: open items for the next `days` days, grouped per Istanbul date
      const upcomingStart = startOfToday.plus({ days: 1 });
      const upcomingEnd = startOfToday.plus({ days }).endOf('day');
      const rawUpcoming = await deps.itemService.list(ownerId, {
        from: upcomingStart.toUTC().toISO()!,
        to: upcomingEnd.toUTC().toISO()!,
        status: 'open',
      });

      const matchingUpcoming: Array<{ dateKey: string; instantMs: number; item: any }> = [];

      for (const item of rawUpcoming) {
        let dateKey: string | null = null;
        if (item.occursOn) {
          dateKey = item.occursOn;
        } else if (item.scheduledAt) {
          dateKey = DateTime.fromISO(item.scheduledAt).setZone(ISTANBUL_ZONE).toISODate();
        } else if (item.dueAt) {
          dateKey = DateTime.fromISO(item.dueAt).setZone(ISTANBUL_ZONE).toISODate();
        }

        if (
          !dateKey ||
          dateKey < upcomingStart.toISODate()! ||
          dateKey > upcomingEnd.toISODate()!
        ) {
          continue;
        }

        let instantMs: number;
        if (item.occursOn) {
          const anchorIso = item.scheduledAt ?? item.dueAt;
          if (anchorIso) {
            const templateDt = DateTime.fromISO(anchorIso, { setZone: true }).setZone(
              ISTANBUL_ZONE,
            );
            if (templateDt.isValid) {
              const rebuiltDt = DateTime.fromISO(item.occursOn, { zone: ISTANBUL_ZONE }).set({
                hour: templateDt.hour,
                minute: templateDt.minute,
                second: templateDt.second,
                millisecond: templateDt.millisecond,
              });
              instantMs = rebuiltDt.isValid
                ? rebuiltDt.toMillis()
                : DateTime.fromISO(item.occursOn, { zone: ISTANBUL_ZONE })
                    .startOf('day')
                    .toMillis();
            } else {
              instantMs = DateTime.fromISO(item.occursOn, { zone: ISTANBUL_ZONE })
                .startOf('day')
                .toMillis();
            }
          } else {
            instantMs = DateTime.fromISO(item.occursOn, { zone: ISTANBUL_ZONE })
              .startOf('day')
              .toMillis();
          }
        } else {
          const anchorIso = item.scheduledAt ?? item.dueAt;
          if (anchorIso) {
            const dt = DateTime.fromISO(anchorIso, { setZone: true }).setZone(ISTANBUL_ZONE);
            instantMs = dt.isValid
              ? dt.toMillis()
              : DateTime.fromISO(dateKey, { zone: ISTANBUL_ZONE }).startOf('day').toMillis();
          } else {
            instantMs = DateTime.fromISO(dateKey, { zone: ISTANBUL_ZONE })
              .startOf('day')
              .toMillis();
          }
        }

        matchingUpcoming.push({ dateKey, instantMs, item });
      }

      const totalUpcomingCount = matchingUpcoming.length;

      // Sort by instant (Istanbul date, then time) BEFORE capping
      matchingUpcoming.sort((a, b) => {
        if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
        if (a.instantMs !== b.instantMs) return a.instantMs - b.instantMs;
        return String(a.item.id).localeCompare(String(b.item.id));
      });

      const cappedUpcoming = matchingUpcoming.slice(0, MAX_UPCOMING_ITEMS);
      const upcoming: Record<string, any[]> = {};

      for (const entry of cappedUpcoming) {
        const { dateKey, item } = entry;
        if (!upcoming[dateKey]) upcoming[dateKey] = [];
        upcoming[dateKey].push({
          id: item.id,
          kind: item.kind,
          title: item.title,
          notes: truncateNote(item.notes),
          context: item.context ?? null,
          projectId: item.projectId ?? null,
          scheduledAt: item.scheduledAt ?? null,
          dueAt: item.dueAt ?? null,
          durationMin: item.durationMin ?? null,
          status: item.status,
          ...(item.occursOn ? { occursOn: item.occursOn } : {}),
        });
      }

      // 3. Overdue section: open items with dueAt before start of today
      const rawOverdue = await deps.itemService.list(ownerId, {
        to: startOfTodayUtc,
        status: 'open',
      });

      const matchingOverdue = rawOverdue
        .filter((item) => {
          if (item.status !== 'open' || !item.dueAt) return false;
          return item.dueAt < startOfTodayUtc;
        })
        .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));

      const totalOverdueCount = matchingOverdue.length;
      const overdueItems = matchingOverdue.slice(0, MAX_OVERDUE_ITEMS).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        notes: truncateNote(item.notes),
        context: item.context ?? null,
        projectId: item.projectId ?? null,
        scheduledAt: item.scheduledAt ?? null,
        dueAt: item.dueAt ?? null,
        durationMin: item.durationMin ?? null,
        status: item.status,
      }));

      // 4. Active projects section: only if caller has projects:read
      let activeProjects: any[] | undefined = undefined;
      const hasProjectsScope = scopes.includes('projects:read');
      if (hasProjectsScope) {
        const owned = await deps.projectService.listOwned(ownerId);
        activeProjects = owned
          .filter((p: any) => !p.archived)
          .slice(0, MAX_ACTIVE_PROJECTS)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            status: p.status,
          }));
      }

      // 5. Active goals section: only if caller has goals:read
      let activeGoals: any[] | undefined = undefined;
      let isGoalsTruncated = false;
      const hasGoalsScope = scopes.includes('goals:read');
      if (hasGoalsScope && deps.goalService) {
        const rawGoals = await deps.goalService.list(ownerId, {
          status: 'active',
          from: todayDateStr,
          to: todayDateStr,
          limit: MAX_ACTIVE_GOALS + 1,
        });
        isGoalsTruncated = rawGoals.length > MAX_ACTIVE_GOALS;
        const sortedGoals = [...rawGoals].sort((a, b) => {
          const endA = a.periodEnd ?? '';
          const endB = b.periodEnd ?? '';
          return endA.localeCompare(endB);
        });
        activeGoals = sortedGoals.slice(0, MAX_ACTIVE_GOALS);
      }

      // 6. Recent changes section: last 5 change sets
      const changeSetsResult = await deps.changeSetService.list(ownerId, {
        limit: MAX_RECENT_CHANGES,
      });
      const recentChanges = (changeSetsResult.items || [])
        .slice(0, MAX_RECENT_CHANGES)
        .map((cs: any) => ({
          id: cs.id,
          label: cs.label,
          source: cs.source,
          status: cs.status,
          createdAt: cs.createdAt,
        }));

      // 7. Truncation flags and counts
      const truncated: Record<string, boolean> = {
        upcoming: totalUpcomingCount > MAX_UPCOMING_ITEMS,
        overdue: totalOverdueCount > MAX_OVERDUE_ITEMS,
      };
      if (activeGoals !== undefined) {
        truncated.goals = isGoalsTruncated;
      }

      const counts: Record<string, number> = {
        todayDue: dueToday.length,
        todayTimeline: timeline.length,
        upcoming: totalUpcomingCount,
        overdue: totalOverdueCount,
        recentChanges: recentChanges.length,
      };
      if (activeProjects !== undefined) {
        counts.activeProjects = activeProjects.length;
      }
      if (activeGoals !== undefined) {
        counts.activeGoals = activeGoals.length;
      }

      return textResult({
        today,
        upcoming,
        overdue: overdueItems,
        ...(activeProjects !== undefined ? { activeProjects } : {}),
        ...(activeGoals !== undefined ? { activeGoals } : {}),
        recentChanges,
        counts,
        truncated,
      });
    },
  );
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { isValidNumericId } from '../common/numeric-id.pipe';
import { Task } from '../task/task.entity';
import { Project } from '../project/project.entity';
import { Reminder } from '../reminder/reminder.entity';
import { ReminderList } from '../reminder/reminder-list.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { Goal } from '../goal/goal.entity';
import {
  DeletedEntryDto,
  TRASH_DEFAULT_LIMIT,
  TRASH_KINDS,
  TRASH_MAX_LIMIT,
  TrashKind,
  TrashListResponseDto,
} from './dto/trash-dtos';

export interface TrashListOptions {
  /** Defaults to every kind. An explicit empty list returns an empty page without querying. */
  kinds?: readonly TrashKind[];
  /** ISO 8601 instant; only rows deleted at or after it. */
  since?: string;
  limit?: number;
  cursor?: string;
}

export interface TrashCursor {
  deletedAt: string;
  kind: TrashKind;
  id: string;
}

/** Shape every per-kind query hydrates: id, the title column, deletedAt (+ projectId for tasks). */
interface DeletedRow {
  id: string;
  deletedAt: Date;
  title?: string;
  name?: string;
  projectId?: string | null;
}

interface KindSpec {
  titleColumn: 'title' | 'name';
  restoreTool: string;
  restorePath: (id: string) => string;
}

const KIND_SPECS: Record<TrashKind, KindSpec> = {
  task: {
    titleColumn: 'title',
    restoreTool: 'restore_task',
    restorePath: (id) => `/tasks/${id}/restore`,
  },
  project: {
    titleColumn: 'name',
    restoreTool: 'restore_project',
    restorePath: (id) => `/projects/${id}/restore`,
  },
  reminder: {
    titleColumn: 'title',
    restoreTool: 'restore_reminder',
    restorePath: (id) => `/reminders/${id}/restore`,
  },
  reminder_list: {
    titleColumn: 'name',
    restoreTool: 'restore_reminder_list',
    restorePath: (id) => `/reminder-lists/${id}/restore`,
  },
  calendar_event: {
    titleColumn: 'title',
    restoreTool: 'restore_calendar_event',
    restorePath: (id) => `/calendar/events/${id}/restore`,
  },
  goal: {
    titleColumn: 'title',
    restoreTool: 'restore_goal',
    restorePath: (id) => `/goals/${id}/restore`,
  },
};

/**
 * Mirrors TaskService.restore: a personal task (no project) is visible to its
 * owner only; a project task needs a LIVE project and a LIVE membership row of
 * the caller with at least EDITOR (requireAccess(..., 'EDITOR')). Tasks of a
 * deleted project are deliberately absent: they come back with the project.
 */
const VISIBLE_TASK_SQL =
  '((t.projectId IS NULL AND t.ownerId = :userId) OR t.projectId IN ' +
  '(SELECT p.id FROM project p JOIN project_member pm ON pm.project_id = p.id ' +
  'WHERE p.deleted_at IS NULL AND pm.deleted_at IS NULL AND pm.user_id = :userId ' +
  "AND pm.role IN ('OWNER', 'EDITOR')))";

/**
 * `deleted_at` is stored with microseconds while JS Dates (and therefore the
 * cursor) carry milliseconds. Ordering and the cursor comparison both use the
 * millisecond-truncated value so a page boundary inside one millisecond can
 * neither skip nor repeat rows.
 */
const DELETED_AT_MS = "date_trunc('milliseconds', t.deletedAt)";
const CURSOR_SQL = (idOp: '<' | '<=') =>
  `(${DELETED_AT_MS} < :cursorDeletedAt OR (${DELETED_AT_MS} = :cursorDeletedAt AND t.id ${idOp} :cursorId))`;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function encodeTrashCursor(cursor: TrashCursor): string {
  return Buffer.from(
    JSON.stringify({ d: cursor.deletedAt, k: cursor.kind, i: cursor.id }),
    'utf8',
  ).toString('base64url');
}

/** Throws 400 on anything that is not a cursor this service produced. */
export function decodeTrashCursor(raw: string): TrashCursor {
  const invalid = () => ApiException.badRequest('Invalid cursor');
  if (typeof raw !== 'string' || !raw || !BASE64URL.test(raw)) throw invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!parsed || typeof parsed !== 'object') throw invalid();
  const { d, k, i } = parsed as Record<string, unknown>;
  if (typeof d !== 'string' || Number.isNaN(Date.parse(d))) throw invalid();
  if (typeof k !== 'string' || !(TRASH_KINDS as readonly string[]).includes(k)) throw invalid();
  if (!isValidNumericId(i)) throw invalid();
  return { deletedAt: new Date(d).toISOString(), kind: k as TrashKind, id: i };
}

/** Numeric ids are bigint strings; compare by magnitude without BigInt. */
function compareNumericIdDesc(a: string, b: string): number {
  if (a.length !== b.length) return b.length - a.length;
  return a < b ? 1 : a > b ? -1 : 0;
}

@Injectable()
export class TrashService {
  private readonly repos: Record<TrashKind, Repository<DeletedRow>>;

  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Reminder) reminders: Repository<Reminder>,
    @InjectRepository(ReminderList) reminderLists: Repository<ReminderList>,
    @InjectRepository(CalendarEvent) calendarEvents: Repository<CalendarEvent>,
    @InjectRepository(Goal) goals: Repository<Goal>,
  ) {
    this.repos = {
      task: tasks as unknown as Repository<DeletedRow>,
      project: projects as unknown as Repository<DeletedRow>,
      reminder: reminders as unknown as Repository<DeletedRow>,
      reminder_list: reminderLists as unknown as Repository<DeletedRow>,
      calendar_event: calendarEvents as unknown as Repository<DeletedRow>,
      goal: goals as unknown as Repository<DeletedRow>,
    };
  }

  /**
   * Lists soft-deleted rows the caller may restore, newest deletion first.
   * Every kind is scoped to the caller (owner, or OWNER/EDITOR member for
   * project tasks); only ids, titles and timestamps are read.
   */
  async list(userId: string, opts: TrashListOptions = {}): Promise<TrashListResponseDto> {
    const kinds = opts.kinds === undefined ? [...TRASH_KINDS] : [...opts.kinds];
    for (const k of kinds) {
      if (!(TRASH_KINDS as readonly string[]).includes(k)) {
        throw ApiException.badRequest(`Unknown kind '${k}'`);
      }
    }
    const since = this.parseSince(opts.since);
    const cursor = opts.cursor ? decodeTrashCursor(opts.cursor) : null;
    const limit = Math.min(
      TRASH_MAX_LIMIT,
      Math.max(1, Math.trunc(opts.limit ?? TRASH_DEFAULT_LIMIT)),
    );
    if (kinds.length === 0) return { items: [], nextCursor: null };

    const perKind = await Promise.all(
      kinds.map(async (kind) => {
        const rows = await this.queryKind(kind, userId, { since, cursor, take: limit + 1 });
        return rows.map((row) => ({ kind, row }));
      }),
    );

    const merged = perKind.flat().sort((a, b) => {
      const byDate = b.row.deletedAt.getTime() - a.row.deletedAt.getTime();
      if (byDate !== 0) return byDate;
      const byId = compareNumericIdDesc(a.row.id, b.row.id);
      if (byId !== 0) return byId;
      return TRASH_KINDS.indexOf(a.kind) - TRASH_KINDS.indexOf(b.kind);
    });
    const page = merged.slice(0, limit);
    const projectNames = await this.resolveProjectNames(page.map((e) => e.row));
    const items = page.map(({ kind, row }) => this.toEntry(kind, row, projectNames));
    const last = page[page.length - 1];
    const nextCursor =
      merged.length > limit && last
        ? encodeTrashCursor({
            deletedAt: last.row.deletedAt.toISOString(),
            kind: last.kind,
            id: last.row.id,
          })
        : null;
    return { items, nextCursor };
  }

  private parseSince(since: string | undefined): Date | null {
    if (since === undefined || since === null || since === '') return null;
    const parsed = typeof since === 'string' ? new Date(since) : new Date(NaN);
    if (Number.isNaN(parsed.getTime())) {
      throw ApiException.badRequest('Invalid since: must be an ISO 8601 date-time');
    }
    return parsed;
  }

  private queryKind(
    kind: TrashKind,
    userId: string,
    q: { since: Date | null; cursor: TrashCursor | null; take: number },
  ): Promise<DeletedRow[]> {
    const columns = ['t.id', `t.${KIND_SPECS[kind].titleColumn}`, 't.deletedAt'];
    if (kind === 'task') columns.push('t.projectId');

    let qb: SelectQueryBuilder<DeletedRow> = this.repos[kind]
      .createQueryBuilder('t')
      .withDeleted()
      .select(columns)
      .where('t.deletedAt IS NOT NULL');
    qb =
      kind === 'task'
        ? qb.andWhere(VISIBLE_TASK_SQL, { userId })
        : qb.andWhere('t.ownerId = :userId', { userId });
    if (q.since) qb = qb.andWhere('t.deletedAt >= :since', { since: q.since });
    if (q.cursor) {
      // Full order is (deletedAt DESC, id DESC, kind index ASC): a kind that
      // sorts after the cursor's kind may still emit the row that ties on
      // both deletedAt and id.
      const idOp = TRASH_KINDS.indexOf(kind) > TRASH_KINDS.indexOf(q.cursor.kind) ? '<=' : '<';
      qb = qb.andWhere(CURSOR_SQL(idOp), {
        cursorDeletedAt: new Date(q.cursor.deletedAt),
        cursorId: q.cursor.id,
      });
    }
    return qb.orderBy(DELETED_AT_MS, 'DESC').addOrderBy('t.id', 'DESC').take(q.take).getMany();
  }

  /** Names of the LIVE projects referenced by the page's tasks (default find excludes deleted). */
  private async resolveProjectNames(rows: DeletedRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.projectId).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const projects = await this.projects.find({ where: { id: In(ids) }, select: ['id', 'name'] });
    return new Map(projects.map((p) => [p.id, p.name]));
  }

  private toEntry(
    kind: TrashKind,
    row: DeletedRow,
    projectNames: Map<string, string>,
  ): DeletedEntryDto {
    const spec = KIND_SPECS[kind];
    const projectId = kind === 'task' ? (row.projectId ?? null) : null;
    return {
      kind,
      id: row.id,
      title: (spec.titleColumn === 'name' ? row.name : row.title) ?? '',
      deletedAt: row.deletedAt.toISOString(),
      projectId,
      projectName: projectId ? (projectNames.get(projectId) ?? null) : null,
      restoreTool: spec.restoreTool,
      restorePath: spec.restorePath(row.id),
    };
  }
}

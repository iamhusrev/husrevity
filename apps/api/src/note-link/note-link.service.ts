import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NoteLink } from './note-link.entity';
import { NoteService } from '../note/note.service';
import { ItemService } from '../item/item.service';
import { ProjectAccessService } from '../project/project-access.service';
import { GoalService } from '../goal/goal.service';
import { ApiException } from '../common/api.exception';
import { isValidNumericId } from '../common/numeric-id.pipe';
import {
  CreateNoteLinkDto,
  LinkedNoteDto,
  NoteLinkQueryDto,
  NoteLinkResponseDto,
  NoteLinkTargetType,
} from './dto/note-link-dtos';

/**
 * Faz 2 (ADR 14) — Generic Note Links service.
 *
 * Design note on note soft-deletion:
 * NoteModule cannot depend on NoteLinkModule to prevent circular module dependencies
 * (NoteLinkModule -> NoteModule -> NoteLinkModule). Because Note entity has no
 * lifecycle hook point, all queries in NoteLinkService strictly join and filter
 * by live notes (n.deleted_at IS NULL) and ownerId. When a note is soft-deleted,
 * its links are transparently excluded from all queries and target lookups.
 */
@Injectable()
export class NoteLinkService {
  constructor(
    @InjectRepository(NoteLink)
    private readonly noteLinks: Repository<NoteLink>,
    private readonly notes: NoteService,
    private readonly items: ItemService,
    private readonly projectAccess: ProjectAccessService,
    private readonly goals: GoalService,
    private readonly dataSource: DataSource,
  ) {}

  private validateId(id: string, label: string): void {
    if (!isValidNumericId(id)) {
      throw ApiException.badRequest(`Invalid ${label}: must be a numeric ID (1-19 digits)`);
    }
  }

  /**
   * Links a note to an item, project, or goal.
   * - Note must belong to caller (404 otherwise).
   * - Target must exist and be accessible:
   *   - Item: ItemService.get (access gates apply)
   *   - Project: ProjectAccessService.requireAccess(userId, id, 'VIEWER')
   *   - Goal: GoalService.get
   * - Idempotent: returns existing active link if already linked.
   * - Max 50 live links per note (400 if exceeded).
   */
  async createLink(
    userId: string,
    noteId: string,
    dto: CreateNoteLinkDto,
  ): Promise<NoteLinkResponseDto> {
    this.validateId(noteId, 'note id');
    this.validateId(dto.targetId, 'target id');

    // 1. Ensure note belongs to caller and is live
    await this.notes.get(userId, noteId);

    // 2. Validate target existence and access, and resolve its title
    let targetTitle: string;
    if (dto.targetType === NoteLinkTargetType.ITEM) {
      const item = await this.items.get(userId, dto.targetId);
      targetTitle = item.title;
    } else if (dto.targetType === NoteLinkTargetType.PROJECT) {
      const { project } = await this.projectAccess.requireAccess(
        userId,
        dto.targetId,
        'VIEWER',
      );
      targetTitle = project.name;
    } else if (dto.targetType === NoteLinkTargetType.GOAL) {
      const goal = await this.goals.get(userId, dto.targetId);
      targetTitle = goal.title;
    } else {
      throw ApiException.badRequest('Invalid target type');
    }

    // 3. Idempotency: return existing live link if one already exists
    const existing = await this.noteLinks.findOne({
      where: {
        ownerId: userId,
        noteId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });
    if (existing) {
      return NoteLinkResponseDto.from(existing, targetTitle);
    }

    // 4. Enforce cap: at most 50 live links per note
    const count = await this.noteLinks.count({
      where: { ownerId: userId, noteId },
    });
    if (count >= 50) {
      throw ApiException.badRequest('A note can have at most 50 links');
    }

    // 5. Create and persist new link
    const entity = this.noteLinks.create({
      ownerId: userId,
      noteId,
      targetType: dto.targetType,
      targetId: dto.targetId,
    });
    let saved: NoteLink;
    try {
      saved = await this.noteLinks.save(entity);
    } catch (err) {
      // A concurrent identical request won the race: the partial unique index
      // (uq_note_link_live) rejects the loser with 23505. Linking is
      // idempotent, so return the winner's row instead of a 500.
      const code =
        (err as { code?: string; driverError?: { code?: string } }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (code !== '23505') throw err;
      const winner = await this.noteLinks.findOne({
        where: {
          ownerId: userId,
          noteId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      });
      if (!winner) throw err;
      return NoteLinkResponseDto.from(winner, targetTitle);
    }

    return NoteLinkResponseDto.from(saved, targetTitle);
  }

  /**
   * Lists all links attached to a note, resolving target titles via bounded batch queries.
   */
  async getLinksForNote(userId: string, noteId: string): Promise<NoteLinkResponseDto[]> {
    this.validateId(noteId, 'note id');

    // Ensure note belongs to caller and is live
    await this.notes.get(userId, noteId);

    const links = await this.noteLinks.find({
      where: { ownerId: userId, noteId },
      order: { createdAt: 'ASC' },
    });
    if (links.length === 0) return [];

    // Group target IDs by targetType for bounded resolution
    const itemIds = Array.from(
      new Set(links.filter((l) => l.targetType === 'item').map((l) => l.targetId)),
    );
    const projectIds = Array.from(
      new Set(links.filter((l) => l.targetType === 'project').map((l) => l.targetId)),
    );
    const goalIds = Array.from(
      new Set(links.filter((l) => l.targetType === 'goal').map((l) => l.targetId)),
    );

    const titleMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const rows: Array<{ id: string; title: string }> = await this.dataSource.query(
        `SELECT i.id, i.title
         FROM items i
         LEFT JOIN project_member pm ON pm.project_id = i.project_id AND pm.user_id = $2 AND pm.deleted_at IS NULL
         WHERE i.id = ANY($1::bigint[])
           AND i.deleted_at IS NULL
           AND ((i.project_id IS NULL AND i.owner_id = $2) OR (i.project_id IS NOT NULL AND pm.user_id IS NOT NULL))`,
        [itemIds, userId],
      );
      for (const row of rows) {
        titleMap.set(`item:${String(row.id)}`, row.title);
      }
    }

    if (projectIds.length > 0) {
      const rows: Array<{ id: string; title: string }> = await this.dataSource.query(
        `SELECT p.id, p.name AS title
         FROM project p
         JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = $2 AND pm.deleted_at IS NULL
         WHERE p.id = ANY($1::bigint[])
           AND p.deleted_at IS NULL`,
        [projectIds, userId],
      );
      for (const row of rows) {
        titleMap.set(`project:${String(row.id)}`, row.title);
      }
    }

    if (goalIds.length > 0) {
      const rows: Array<{ id: string; title: string }> = await this.dataSource.query(
        `SELECT g.id, g.title
         FROM goal g
         WHERE g.id = ANY($1::bigint[])
           AND g.owner_id = $2
           AND g.deleted_at IS NULL`,
        [goalIds, userId],
      );
      for (const row of rows) {
        titleMap.set(`goal:${String(row.id)}`, row.title);
      }
    }

    return links.map((link) =>
      NoteLinkResponseDto.from(
        link,
        titleMap.get(`${link.targetType}:${link.targetId}`) ?? null,
      ),
    );
  }

  /**
   * Soft-deletes a note link owned by the caller.
   */
  async deleteLink(userId: string, noteId: string, linkId: string): Promise<void> {
    this.validateId(noteId, 'note id');
    this.validateId(linkId, 'link id');

    // Ensure note belongs to caller
    await this.notes.get(userId, noteId);

    const link = await this.noteLinks.findOne({
      where: { id: linkId, noteId, ownerId: userId },
    });
    if (!link) {
      throw ApiException.notFound('Note link not found');
    }

    await this.noteLinks.softRemove(link);
  }

  /**
   * Lists the caller's notes linked to a specific target.
   * - Validates target existence and access for caller.
   * - Returns only caller's notes (even for a shared project).
   * - Excludes soft-deleted notes and soft-deleted links.
   * - Capped at 100, newest first by note.updated_at.
   */
  async listNotesForTarget(
    userId: string,
    query: NoteLinkQueryDto,
  ): Promise<LinkedNoteDto[]> {
    this.validateId(query.targetId, 'target id');

    // 1. Verify caller access to the target
    if (query.targetType === NoteLinkTargetType.ITEM) {
      await this.items.get(userId, query.targetId);
    } else if (query.targetType === NoteLinkTargetType.PROJECT) {
      await this.projectAccess.requireAccess(userId, query.targetId, 'VIEWER');
    } else if (query.targetType === NoteLinkTargetType.GOAL) {
      await this.goals.get(userId, query.targetId);
    } else {
      throw ApiException.badRequest('Invalid target type');
    }

    // 2. Query caller's live notes linked to this target
    const rows: Array<{ id: string; title: string; updatedAt: Date }> =
      await this.dataSource.query(
        `SELECT n.id, n.title, n.updated_at AS "updatedAt"
         FROM note_link nl
         JOIN note n ON n.id = nl.note_id
         WHERE nl.owner_id = $1
           AND nl.target_type = $2
           AND nl.target_id = $3
           AND nl.deleted_at IS NULL
           AND n.deleted_at IS NULL
           AND n.owner_id = $1
         ORDER BY n.updated_at DESC
         LIMIT 100`,
        [userId, query.targetType, query.targetId],
      );

    return rows.map((r) => ({
      id: String(r.id),
      title: r.title,
      updatedAt: r.updatedAt,
    }));
  }
}

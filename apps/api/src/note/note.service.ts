import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { Note } from './note.entity';
import { NoteTag } from './note-tag.entity';
import { ApiException } from '../common/api.exception';
import { assertIfMatch } from '../common/if-match';
import {
  NoteRequestDto,
  NoteResponseDto,
  ReorderItemDto,
  TagDto,
  TagRequestDto,
} from './dto/note-dtos';

@Injectable()
export class NoteService {
  constructor(
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    @InjectRepository(NoteTag) private readonly tags: Repository<NoteTag>,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    ownerId: string,
    q: string | undefined,
    tagId: string | undefined,
    archived: boolean | undefined,
  ): Promise<NoteResponseDto[]> {
    const qb = this.notes
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.tags', 't')
      .where('n.owner_id = :ownerId', { ownerId });

    if (typeof archived === 'boolean') {
      qb.andWhere('n.archived = :archived', { archived });
    }
    if (q && q.trim().length > 0) {
      qb.andWhere('(n.title ILIKE :q OR n.body_markdown ILIKE :q)', { q: `%${q}%` });
    }
    if (tagId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM note_tag_assignment a
          JOIN note_tag t ON t.id = a.tag_id AND t.deleted_at IS NULL
          WHERE a.note_id = n.id AND a.tag_id = :tagId
        )`,
        { tagId },
      );
    }

    qb.orderBy('n.pinned', 'DESC')
      .addOrderBy('n.position', 'ASC')
      .addOrderBy('n.updated_at', 'DESC');

    const rows = await qb.getMany();
    return rows.map(NoteResponseDto.from);
  }

  async get(ownerId: string, id: string): Promise<NoteResponseDto> {
    const n = await this.requireOwned(ownerId, id);
    return NoteResponseDto.from(n);
  }

  async create(ownerId: string, req: NoteRequestDto): Promise<NoteResponseDto> {
    const tags = await this.resolveTags(ownerId, req.tagIds);
    const note = this.notes.create({
      ownerId,
      title: req.title,
      bodyMarkdown: req.bodyMarkdown ?? null,
      pinned: req.pinned ?? false,
      archived: req.archived ?? false,
      position: 0,
      colorHex: req.colorHex ?? null,
      tags,
    });
    const saved = await this.notes.save(note);
    return NoteResponseDto.from(saved);
  }

  async update(
    ownerId: string,
    id: string,
    req: NoteRequestDto,
    ifMatchMs?: number,
  ): Promise<NoteResponseDto> {
    const note = await this.requireOwned(ownerId, id);
    assertIfMatch(note.updatedAt, ifMatchMs, 'Note');
    note.title = req.title;
    note.bodyMarkdown = req.bodyMarkdown ?? null;
    if (req.pinned !== undefined) note.pinned = req.pinned;
    if (req.archived !== undefined) note.archived = req.archived;
    if (req.colorHex !== undefined) note.colorHex = req.colorHex || null;
    note.tags = await this.resolveTags(ownerId, req.tagIds);
    const saved = await this.notes.save(note);
    return NoteResponseDto.from(saved);
  }

  async delete(ownerId: string, id: string, ifMatchMs?: number): Promise<void> {
    const note = await this.requireOwned(ownerId, id);
    assertIfMatch(note.updatedAt, ifMatchMs, 'Note');
    await this.notes.softRemove(note);
  }

  async reorder(ownerId: string, items: ReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(Note)
          .set({ position: it.position })
          .where('id = :id AND owner_id = :ownerId', { id: it.id, ownerId })
          .execute();
      }
    });
  }

  async listTags(ownerId: string): Promise<TagDto[]> {
    const rows = await this.tags.find({
      where: { ownerId },
      order: { name: 'ASC' },
    });
    return rows.map(TagDto.from);
  }

  async createTag(ownerId: string, req: TagRequestDto): Promise<TagDto> {
    const existing = await this.tags.findOne({
      where: { ownerId, name: req.name },
    });
    if (existing) throw ApiException.conflict('Tag with that name already exists');
    const tag = this.tags.create({
      ownerId,
      name: req.name,
      color: req.color ?? null,
    });
    return TagDto.from(await this.tags.save(tag));
  }

  async getTag(ownerId: string, id: string): Promise<TagDto> {
    return TagDto.from(await this.requireTag(ownerId, id));
  }

  async deleteTag(ownerId: string, id: string): Promise<void> {
    const tag = await this.requireTag(ownerId, id);
    await this.dataSource.transaction(async (em) => {
      // Soft delete, not a hard delete: sync clients learn about it from the tombstone.
      await em.getRepository(NoteTag).softRemove(tag);
      // A note embeds its tags, so touch the carriers: the next sync re-sends them without it.
      await em.query(
        `UPDATE note SET updated_at = now()
         WHERE owner_id = $1 AND id IN (SELECT note_id FROM note_tag_assignment WHERE tag_id = $2)`,
        [ownerId, id],
      );
    });
  }

  private async requireTag(ownerId: string, id: string): Promise<NoteTag> {
    const tag = await this.tags.findOne({ where: { id, ownerId } });
    if (!tag) throw ApiException.notFound('Tag not found');
    return tag;
  }

  private async requireOwned(ownerId: string, id: string): Promise<Note> {
    const n = await this.notes.findOne({
      where: { id, ownerId },
      relations: { tags: true },
    });
    if (!n) throw ApiException.notFound('Note not found');
    return n;
  }

  private async resolveTags(ownerId: string, tagIds: string[] | undefined): Promise<NoteTag[]> {
    if (!tagIds || tagIds.length === 0) return [];
    const tags = await this.tags.find({
      where: { id: In(tagIds), ownerId },
    });
    if (tags.length !== tagIds.length) {
      throw ApiException.badRequest('One or more tagIds invalid for this user');
    }
    return tags;
  }
}

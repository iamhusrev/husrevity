import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Not, IsNull, Repository, FindOptionsWhere } from 'typeorm';
import { Item } from '../item/item.entity';
import { Note } from '../note/note.entity';
import { Project } from '../project/project.entity';

interface DeltaRow {
  id: string;
  ownerId: string;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface Delta<T> {
  live: T[];
  tombstoneIds: string[];
}

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  async itemsDelta(ownerId: string, since: Date): Promise<Delta<Item>> {
    return this.deltaFor(this.items, ownerId, since);
  }

  async notesDelta(ownerId: string, since: Date): Promise<Delta<Note>> {
    return this.deltaFor(this.notes, ownerId, since);
  }

  async projectsDelta(ownerId: string, since: Date): Promise<Delta<Project>> {
    return this.deltaFor(this.projects, ownerId, since);
  }

  /**
   * Full sync payload: the new cursor is `now()` at the START of the
   * query batch (not the max updatedAt seen), so a row written between
   * this query and the response being sent is never silently skipped on
   * the next call — it'll just be re-sent once, which is harmless.
   */
  async syncSince(ownerId: string, since: Date | null): Promise<{
    items: Delta<Item>;
    notes: Delta<Note>;
    projects: Delta<Project>;
    cursor: string;
  }> {
    const cursor = new Date().toISOString();
    const from = since ?? new Date(0);
    const [items, notes, projects] = await Promise.all([
      this.itemsDelta(ownerId, from),
      this.notesDelta(ownerId, from),
      this.projectsDelta(ownerId, from),
    ]);
    return { items, notes, projects, cursor };
  }

  /**
   * Generic delta query for any owner-scoped, soft-deletable entity: live
   * rows updated since the cursor (soft-deleted rows excluded by TypeORM's
   * default behavior), plus tombstone ids for rows soft-deleted since the
   * cursor (`withDeleted: true` + an explicit `deletedAt IS NOT NULL`
   * filter, since `withDeleted` alone would also let live rows back in).
   */
  private async deltaFor<T extends DeltaRow>(
    repo: Repository<T>,
    ownerId: string,
    since: Date,
  ): Promise<Delta<T>> {
    const live = await repo.find({
      where: { ownerId, updatedAt: MoreThan(since) } as unknown as FindOptionsWhere<T>,
      order: { updatedAt: 'ASC' } as never,
    });
    const tombstoneRows = await repo.find({
      where: {
        ownerId,
        updatedAt: MoreThan(since),
        deletedAt: Not(IsNull()),
      } as unknown as FindOptionsWhere<T>,
      withDeleted: true,
      order: { updatedAt: 'ASC' } as never,
    });
    return { live, tombstoneIds: tombstoneRows.map((r) => r.id) };
  }
}

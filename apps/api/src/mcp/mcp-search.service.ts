import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Item, ItemKind } from '../item/item.entity';
import { Note } from '../note/note.entity';

export interface SearchResultItem {
  type: 'item';
  id: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  status: string;
  scheduledAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
}

export interface SearchResultNote {
  type: 'note';
  id: string;
  title: string;
  bodyMarkdown: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt: Date;
}

export type SearchResult = SearchResultItem | SearchResultNote;

export interface SearchOptions {
  kinds?: string[];
}

@Injectable()
export class McpSearchService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
  ) {}

  async search(
    ownerId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const kinds = options?.kinds?.map((k) => k.toLowerCase()) ?? [];

    const shouldSearchNotes =
      kinds.length === 0 || kinds.includes('note') || kinds.includes('notes');

    const itemKindFilters: ItemKind[] = [];
    if (kinds.includes('task')) itemKindFilters.push('task');
    if (kinds.includes('event')) itemKindFilters.push('event');
    if (kinds.includes('log')) itemKindFilters.push('log');

    const shouldSearchItems =
      kinds.length === 0 ||
      kinds.includes('item') ||
      kinds.includes('items') ||
      itemKindFilters.length > 0;

    const results: SearchResult[] = [];

    if (shouldSearchItems) {
      const items = await this.itemRepo.find({
        where: {
          ownerId,
          title: ILike(`%${trimmedQuery}%`),
        },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      const filteredItems =
        itemKindFilters.length > 0
          ? items.filter((item) => itemKindFilters.includes(item.kind))
          : items;

      for (const item of filteredItems) {
        results.push({
          type: 'item',
          id: item.id,
          kind: item.kind,
          title: item.title,
          notes: item.notes,
          status: item.status,
          scheduledAt: item.scheduledAt,
          dueAt: item.dueAt,
          createdAt: item.createdAt,
        });
      }
    }

    if (shouldSearchNotes) {
      const notes = await this.noteRepo.find({
        where: {
          ownerId,
          title: ILike(`%${trimmedQuery}%`),
        },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      for (const note of notes) {
        results.push({
          type: 'note',
          id: note.id,
          title: note.title,
          bodyMarkdown: note.bodyMarkdown,
          pinned: note.pinned,
          archived: note.archived,
          createdAt: note.createdAt,
        });
      }
    }

    return results;
  }
}

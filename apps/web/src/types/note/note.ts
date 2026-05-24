export interface NoteTagDto {
  id: number;
  name: string;
  color?: string | null;
}

export interface NoteResponse {
  id: number;
  title: string;
  bodyMarkdown: string | null;
  pinned: boolean;
  archived: boolean;
  position: number;
  colorHex: string | null;
  tags: NoteTagDto[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NoteRequest {
  title: string;
  bodyMarkdown?: string | null;
  pinned?: boolean;
  archived?: boolean;
  tagIds?: number[];
  colorHex?: string | null;
}

export interface TagRequest {
  name: string;
  color?: string | null;
}

export interface NoteFilters {
  q?: string;
  tagId?: number;
  archived?: boolean;
}

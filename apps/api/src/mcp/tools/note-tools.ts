import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { NoteService } from '../../note/note.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface NoteToolsDeps {
  noteService: NoteService;
}

export function registerNoteTools(server: McpServer, deps: NoteToolsDeps) {
  server.registerTool<any, any>(
    'create_note',
    {
      description: 'Create a new note with optional markdown body and pinned flag',
      inputSchema: {
        title: z.string().describe('Title of the note'),
        body: z.string().optional().describe('Markdown body of the note'),
        pinned: z.boolean().optional().describe('Whether the note is pinned'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notes:write');
      const note = await deps.noteService.create(ownerId, {
        title: params.title,
        bodyMarkdown: params.body,
        pinned: params.pinned,
      });
      return textResult(note);
    },
  );

  server.registerTool<any, any>(
    'list_notes',
    {
      description: 'List notes',
      inputSchema: {
        q: z.string().optional().describe('Search query'),
        tagId: z.string().optional().describe('Filter by tag ID'),
        archived: z.boolean().optional().describe('Filter by archived status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notes:read');
      const notes = await deps.noteService.list(
        ownerId,
        params.q,
        params.tagId,
        params.archived,
      );
      return textResult(notes);
    },
  );

  server.registerTool<any, any>(
    'get_note',
    {
      description: 'Get a note by ID',
      inputSchema: {
        id: z.string().describe('Note ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notes:read');
      const note = await deps.noteService.get(ownerId, params.id);
      return textResult(note);
    },
  );

  server.registerTool<any, any>(
    'update_note',
    {
      description: 'Update a note. Omitted fields are not changed.',
      inputSchema: {
        id: z.string().describe('Note ID'),
        title: z.string().optional().describe('New title'),
        bodyMarkdown: z.string().optional().describe('New markdown body'),
        pinned: z.boolean().optional().describe('Pinned status'),
        archived: z.boolean().optional().describe('Archived status'),
        tagIds: z.array(z.string()).optional().describe('Tag IDs to assign'),
        colorHex: z.string().optional().describe('Hex color code'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notes:write');
      const current = await deps.noteService.get(ownerId, params.id);
      const note = await deps.noteService.update(ownerId, params.id, {
        title: params.title ?? current.title,
        bodyMarkdown: params.bodyMarkdown !== undefined ? params.bodyMarkdown : (current.bodyMarkdown ?? undefined),
        pinned: params.pinned ?? current.pinned,
        archived: params.archived ?? current.archived,
        tagIds: params.tagIds ?? current.tags.map(t => t.id),
        colorHex: params.colorHex !== undefined ? params.colorHex : (current.colorHex ?? undefined),
      });
      return textResult(note);
    },
  );

  server.registerTool<any, any>(
    'list_note_tags',
    {
      description: 'List note tags',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notes:read');
      const tags = await deps.noteService.listTags(ownerId);
      return textResult(tags);
    },
  );

  server.registerTool<any, any>(
    'create_note_tag',
    {
      description: 'Create a new note tag',
      inputSchema: {
        name: z.string().describe('Tag name'),
        color: z.string().optional().describe('Tag color (optional)'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'notes:write');
      const tag = await deps.noteService.createTag(ownerId, {
        name: params.name,
        color: params.color,
      });
      return textResult(tag);
    },
  );
}

import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LearningService } from '../../learning/learning.service';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface LearningToolDeps {
  learningService: LearningService;
}

export function registerLearningTools(server: McpServer, deps: LearningToolDeps) {
  server.registerTool<any, any>(
    'list_learning',
    {
      description: 'List learning topics, with their nested subtopics and items.',
    },
    async (extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:read');
      const topics = await deps.learningService.listTopics(ownerId);
      return textResult(topics);
    },
  );

  server.registerTool<any, any>(
    'create_learning_topic',
    {
      description: 'Create a new learning topic.',
      inputSchema: {
        title: z.string().describe('Title of the topic'),
        description: z.string().optional().describe('Optional description'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const topic = await deps.learningService.createTopic(ownerId, {
        title: params.title,
        description: params.description,
      });
      return textResult(topic);
    },
  );

  server.registerTool<any, any>(
    'update_learning_topic',
    {
      description: 'Update a learning topic. Omitted optional fields are ignored (partial update).',
      inputSchema: {
        id: z.string().describe('Topic ID'),
        title: z.string().optional().describe('Title of the topic'),
        description: z.string().optional().describe('Optional description'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const topics = await deps.learningService.listTopics(ownerId);
      const current = topics.find((t) => t.id === params.id);
      if (!current) throw new Error('Learning topic not found');

      const result = await deps.learningService.updateTopic(ownerId, params.id, {
        title: params.title !== undefined ? params.title : current.title,
        description: params.description !== undefined ? params.description : current.description,
      });
      return textResult(result);
    },
  );

  server.registerTool<any, any>(
    'create_learning_subtopic',
    {
      description: 'Create a new learning subtopic within a topic.',
      inputSchema: {
        topicId: z.string().describe('Parent Topic ID'),
        title: z.string().describe('Title of the subtopic'),
        description: z.string().optional().describe('Optional description'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const subtopic = await deps.learningService.createSubtopic(ownerId, params.topicId, {
        title: params.title,
        description: params.description,
      });
      return textResult(subtopic);
    },
  );

  server.registerTool<any, any>(
    'create_learning_item',
    {
      description: 'Create a new learning item.',
      inputSchema: {
        topicId: z.string().describe('Parent Topic ID'),
        text: z.string().describe('Item text / title'),
        url: z.string().url().optional().describe('Optional valid URL reference'),
        notes: z.string().optional().describe('Optional markdown notes'),
        estimatedMinutes: z.number().int().optional().describe('Estimated duration in minutes'),
        reviewAt: z.string().optional().describe('ISO 8601 date to review this item'),
        notifyMinutesBefore: z.number().int().optional().describe('Notification lead time'),
        subtopicId: z.string().optional().describe('Optional Subtopic ID to place this item under'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const item = await deps.learningService.createItem(ownerId, params.topicId, {
        text: params.text,
        url: params.url,
        notes: params.notes,
        estimatedMinutes: params.estimatedMinutes,
        reviewAt: params.reviewAt,
        notifyMinutesBefore: params.notifyMinutesBefore,
        subtopicId: params.subtopicId,
      });
      return textResult(item);
    },
  );

  server.registerTool<any, any>(
    'update_learning_item',
    {
      description: 'Update a learning item. Omitted optional fields are ignored (partial update).',
      inputSchema: {
        id: z.string().describe('Item ID'),
        text: z.string().optional().describe('Item text / title'),
        url: z.string().url().optional().describe('Optional valid URL reference'),
        notes: z.string().optional().describe('Optional markdown notes'),
        estimatedMinutes: z.number().int().optional().describe('Estimated duration in minutes'),
        reviewAt: z.string().optional().describe('ISO 8601 date to review this item'),
        notifyMinutesBefore: z.number().int().optional().describe('Notification lead time'),
        subtopicId: z.string().optional().describe('Optional Subtopic ID'),
        position: z.number().optional().describe('Position for reordering'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const req: any = {};
      if (params.text !== undefined) req.text = params.text;
      if (params.url !== undefined) req.url = params.url;
      if (params.notes !== undefined) req.notes = params.notes;
      if (params.estimatedMinutes !== undefined) req.estimatedMinutes = params.estimatedMinutes;
      if (params.reviewAt !== undefined) req.reviewAt = params.reviewAt;
      if (params.notifyMinutesBefore !== undefined) req.notifyMinutesBefore = params.notifyMinutesBefore;
      if (params.subtopicId !== undefined) req.subtopicId = params.subtopicId;
      if (params.position !== undefined) req.position = params.position;

      // The service requires the mandatory fields `text`. If the service needs full DTO, we must merge.
      // Let's check LearningService.updateItem. It seems to just check `req.text`.
      // Actually, looking at LearningService.updateItem:
      // item.text = req.text; // this means text is mandatory in DTO.
      // So we must fetch the item to merge. We can find it in listTopics.
      const topics = await deps.learningService.listTopics(ownerId);
      let currentItem: any = null;
      for (const t of topics) {
        if (!currentItem) currentItem = t.items.find(i => i.id === params.id);
        if (!currentItem) {
          for (const st of t.subtopics) {
            currentItem = st.items.find(i => i.id === params.id);
            if (currentItem) break;
          }
        }
      }
      if (!currentItem) throw new Error('Learning item not found');

      req.text = params.text !== undefined ? params.text : currentItem.text;

      const result = await deps.learningService.updateItem(ownerId, params.id, req);
      return textResult(result);
    },
  );

  server.registerTool<any, any>(
    'toggle_learning_item',
    {
      description: 'Toggle the completed state of a learning item.',
      inputSchema: {
        id: z.string().describe('Item ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const result = await deps.learningService.toggleItem(ownerId, params.id);
      return textResult(result);
    },
  );
}

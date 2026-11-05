import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LearningService } from '../../learning/learning.service';
import { ChangeSetService } from '../../change-set/change-set.service';
import { diffLearning, flattenLearning } from './learning-changes';
import { getOwnerAndCheckScope, textResult } from './mcp-tool-helpers';

export interface LearningToolDeps {
  learningService: LearningService;
  changeSetService: ChangeSetService;
}

const orderedIdsSchema = z
  .array(z.string())
  .describe('The complete list of ids in the new order, first = highest priority');

export function registerLearningTools(server: McpServer, deps: LearningToolDeps) {
  server.registerTool<any, any>(
    'get_learning_topic',
    {
      description: 'Get a learning topic by ID, including its direct items and subtopics',
      inputSchema: { id: z.string().describe('Learning topic ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:read');
      return textResult(await deps.learningService.getTopic(ownerId, params.id));
    },
  );

  server.registerTool<any, any>(
    'get_learning_subtopic',
    {
      description: 'Get a learning subtopic by ID, including its items',
      inputSchema: { id: z.string().describe('Learning subtopic ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:read');
      return textResult(await deps.learningService.getSubtopic(ownerId, params.id));
    },
  );

  server.registerTool<any, any>(
    'get_learning_item',
    {
      description: 'Get a single learning item by ID',
      inputSchema: { id: z.string().describe('Learning item ID') },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:read');
      return textResult(await deps.learningService.getItem(ownerId, params.id));
    },
  );

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
        year: z
          .number()
          .int()
          .min(2000)
          .max(2100)
          .optional()
          .describe('Calendar year the topic belongs to (defaults to the creation year)'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const topic = await deps.learningService.createTopic(ownerId, {
        title: params.title,
        description: params.description,
        year: params.year,
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
        year: z
          .number()
          .int()
          .min(2000)
          .max(2100)
          .nullable()
          .optional()
          .describe(
            'Calendar year the topic belongs to. Omit to keep it; null resets it to the creation year',
          ),
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
        // current.year is the resolved year (column ?? created year); echoing it back would pin a
        // derived value into the column, so year is only sent when the caller provides it.
        ...(params.year !== undefined ? { year: params.year } : {}),
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
      if (params.notifyMinutesBefore !== undefined)
        req.notifyMinutesBefore = params.notifyMinutesBefore;
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
        if (!currentItem) currentItem = t.items.find((i) => i.id === params.id);
        if (!currentItem) {
          for (const st of t.subtopics) {
            currentItem = st.items.find((i) => i.id === params.id);
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

  /**
   * Runs a reorder/move through the same service the REST API uses and records one
   * undoable change entry per row whose position or parent changed.
   */
  async function reorderWithChangeSet(ownerId: string, label: string, op: () => Promise<unknown>) {
    const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
      ownerId,
      { source: 'mcp', label },
      async (csId, manager) => {
        const before = flattenLearning((await deps.learningService.listTopics(ownerId)) as any);
        await op();
        const after = flattenLearning((await deps.learningService.listTopics(ownerId)) as any);
        const entries = diffLearning(before, after);
        for (const entry of entries)
          await deps.changeSetService.recordEntry(csId, ownerId, entry, manager);
        return entries.length;
      },
    );
    return textResult({ success: true, changed: result, changeSetId });
  }

  server.registerTool<any, any>(
    'reorder_learning_topics',
    {
      description:
        'Reorder learning topics. orderedIds must be exactly the set of topics being ordered; ' +
        "the first id is the highest priority. With year, only that year's topics are ordered " +
        'and other years keep their place. Undoable with undo_change_set.',
      inputSchema: {
        orderedIds: orderedIdsSchema,
        year: z.number().int().min(2000).max(2100).optional().describe('Order only this year'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      return reorderWithChangeSet(ownerId, 'reorder_learning_topics', () =>
        deps.learningService.reorderTopics(ownerId, {
          year: params.year,
          orderedIds: params.orderedIds,
        }),
      );
    },
  );

  server.registerTool<any, any>(
    'reorder_learning_subtopics',
    {
      description:
        "Reorder the subtopics of a topic. orderedIds must be exactly the topic's subtopics. " +
        'Undoable with undo_change_set.',
      inputSchema: {
        topicId: z.string().describe('Parent topic ID'),
        orderedIds: orderedIdsSchema,
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      return reorderWithChangeSet(ownerId, 'reorder_learning_subtopics', () =>
        deps.learningService.reorderSubtopics(ownerId, params.topicId, {
          orderedIds: params.orderedIds,
        }),
      );
    },
  );

  server.registerTool<any, any>(
    'reorder_learning_items',
    {
      description:
        'Reorder learning items. Give exactly one of subtopicId (the items of that subtopic) ' +
        "or topicId (the topic's direct items, those without a subtopic). orderedIds must be " +
        'exactly that list. Undoable with undo_change_set.',
      inputSchema: {
        orderedIds: orderedIdsSchema,
        topicId: z.string().optional().describe('Reorder the direct items of this topic'),
        subtopicId: z.string().optional().describe('Reorder the items of this subtopic'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      if (!!params.topicId === !!params.subtopicId)
        throw new Error('Provide exactly one of topicId or subtopicId');
      return reorderWithChangeSet(ownerId, 'reorder_learning_items', () =>
        params.subtopicId
          ? deps.learningService.reorderSubtopicItems(ownerId, params.subtopicId, {
              orderedIds: params.orderedIds,
            })
          : deps.learningService.reorderItems(ownerId, params.topicId, {
              orderedIds: params.orderedIds,
            }),
      );
    },
  );

  server.registerTool<any, any>(
    'move_learning_item',
    {
      description:
        'Move a learning item to a position in another subtopic of the same topic, or to the ' +
        "topic's direct list with subtopicId null. Undoable with undo_change_set.",
      inputSchema: {
        itemId: z.string().describe('Item ID'),
        subtopicId: z
          .string()
          .nullable()
          .describe('Target subtopic ID, or null for the topic list'),
        index: z.number().int().min(0).describe('Zero-based index in the target list'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      return reorderWithChangeSet(ownerId, 'move_learning_item', () =>
        deps.learningService.moveItem(ownerId, params.itemId, {
          subtopicId: params.subtopicId,
          index: params.index,
        }),
      );
    },
  );

  server.registerTool<any, any>(
    'update_learning_subtopic',
    {
      description:
        'Update a learning subtopic. Omitted fields are kept; description null clears it. ' +
        'Undoable with undo_change_set.',
      inputSchema: {
        id: z.string().describe('Subtopic ID'),
        title: z.string().optional().describe('New title'),
        description: z.string().nullable().optional().describe('New description, null to clear'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
      const current = await deps.learningService.getSubtopic(ownerId, params.id);
      const { result, changeSetId } = await deps.changeSetService.runWithChangeSet(
        ownerId,
        { source: 'mcp', label: `update_learning_subtopic: ${current.title}` },
        async (csId, manager) => {
          const updated = await deps.learningService.updateSubtopic(ownerId, params.id, {
            title: params.title !== undefined ? params.title : current.title,
            description:
              params.description !== undefined ? params.description : current.description,
          });
          await deps.changeSetService.recordEntry(
            csId,
            ownerId,
            {
              targetType: 'learning_subtopic',
              targetId: params.id,
              op: 'update',
              before: { title: current.title, description: current.description },
              after: {
                title: updated.title,
                description: updated.description,
                updatedAt: updated.updatedAt,
              },
            },
            manager,
          );
          return updated;
        },
      );
      return textResult({ ...result, changeSetId });
    },
  );

  const deletable = [
    {
      tool: 'delete_learning_topic',
      noun: 'topic',
      type: 'learning_topic',
      label: (r: any) => r.title,
      get: (ownerId: string, id: string) => deps.learningService.getTopic(ownerId, id),
      remove: (ownerId: string, id: string) => deps.learningService.deleteTopic(ownerId, id),
    },
    {
      tool: 'delete_learning_subtopic',
      noun: 'subtopic',
      type: 'learning_subtopic',
      label: (r: any) => r.title,
      get: (ownerId: string, id: string) => deps.learningService.getSubtopic(ownerId, id),
      remove: (ownerId: string, id: string) => deps.learningService.deleteSubtopic(ownerId, id),
    },
    {
      tool: 'delete_learning_item',
      noun: 'item',
      type: 'learning_item',
      label: (r: any) => r.text,
      get: (ownerId: string, id: string) => deps.learningService.getItem(ownerId, id),
      remove: (ownerId: string, id: string) => deps.learningService.deleteItem(ownerId, id),
    },
  ] as const;

  for (const spec of deletable) {
    server.registerTool<any, any>(
      spec.tool,
      {
        description:
          `Delete a learning ${spec.noun} (soft delete; ` +
          (spec.noun === 'item' ? '' : 'its children go with it; ') +
          `restore it with restore_learning_${spec.noun} or undo_change_set, find it with list_deleted).`,
        inputSchema: { id: z.string().describe(`Learning ${spec.noun} ID`) },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
        const current = await spec.get(ownerId, params.id);
        const { changeSetId } = await deps.changeSetService.runWithChangeSet(
          ownerId,
          { source: 'mcp', label: `${spec.tool}: ${spec.label(current)}` },
          async (csId, manager) => {
            await spec.remove(ownerId, params.id);
            await deps.changeSetService.recordEntry(
              csId,
              ownerId,
              {
                targetType: spec.type,
                targetId: params.id,
                op: 'delete',
                before: { deletedAt: null },
                after: { deletedAt: new Date().toISOString() },
              },
              manager,
            );
          },
        );
        return textResult({ success: true, changeSetId });
      },
    );
  }

  const restorable = [
    { noun: 'topic', run: (o: string, id: string) => deps.learningService.restoreTopic(o, id) },
    {
      noun: 'subtopic',
      run: (o: string, id: string) => deps.learningService.restoreSubtopic(o, id),
    },
    { noun: 'item', run: (o: string, id: string) => deps.learningService.restoreItem(o, id) },
  ] as const;

  for (const spec of restorable) {
    server.registerTool<any, any>(
      `restore_learning_${spec.noun}`,
      {
        description:
          `Restore a deleted learning ${spec.noun} (see list_deleted). ` +
          'It returns at the end of its list.',
        inputSchema: { id: z.string().describe(`Deleted learning ${spec.noun} ID`) },
      },
      async (params: any, extra: any) => {
        const { ownerId } = getOwnerAndCheckScope(extra, 'learning:write');
        return textResult(await spec.run(ownerId, params.id));
      },
    );
  }
}

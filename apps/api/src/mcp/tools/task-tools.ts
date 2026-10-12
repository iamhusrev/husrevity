import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { TaskService } from '../../task/task.service';
import { ProjectService } from '../../project/project.service';
import { UserService } from '../../user/user.service';
import { getOwnerAndCheckScope, textResult, resolveByIdOrName } from './mcp-tool-helpers';

export interface TaskToolsDeps {
  taskService: TaskService;
  projectService: ProjectService;
  userService: UserService;
}

export function registerTaskTools(server: McpServer, deps: TaskToolsDeps) {
  server.registerTool<any, any>(
    'list_tasks',
    {
      description: 'List tasks for a project. Project can be given by ID, code, or name.',
      inputSchema: {
        project: z.string().describe('Project ID, code or name'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:read');
      const projects = await deps.projectService.list(ownerId, 'all');
      const match = resolveByIdOrName(projects, params.project, 'Project');
      const tasks = await deps.taskService.listForProject(ownerId, match.id);
      return textResult(tasks);
    },
  );

  server.registerTool<any, any>(
    'get_task',
    {
      description: 'Get task details by task ID',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:read');
      const task = await deps.taskService.get(ownerId, params.id);
      return textResult(task);
    },
  );

  server.registerTool<any, any>(
    'create_task',
    {
      description: 'Create a task inside a project (not a reminder). The project can be given by ID, code or name; use list_projects if unsure.',
      inputSchema: {
        project: z.string().min(1).describe('Project ID, code or name (case-insensitive)'),
        title: z.string().min(1).max(255).describe('Task title'),
        description: z.string().optional().describe('Optional task description'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().describe('Priority, defaults to MEDIUM'),
        dueAt: z.string().optional().describe('Due date-time in ISO 8601 with offset, e.g. 2026-10-09T09:00:00+03:00'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const projects = await deps.projectService.list(ownerId, 'all');
      const match = resolveByIdOrName(projects, params.project, 'Project');

      const task = await deps.taskService.createForProject(ownerId, match.id, {
        title: params.title,
        description: params.description,
        priority: params.priority,
        dueAt: params.dueAt,
        notifyMinutesBefore: params.dueAt ? 0 : null,
      });

      return textResult({ project: match.name, task });
    },
  );

  server.registerTool<any, any>(
    'update_task',
    {
      description: 'Update a task. Omitted fields are not changed. assigneeId cannot be changed.',
      inputSchema: {
        id: z.string().describe('Task ID'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status: z.string().optional().describe('New status'),
        priority: z.string().optional().describe('New priority'),
        dueAt: z.string().optional().describe('Due date-time in ISO 8601'),
        notifyMinutesBefore: z.number().int().optional().describe('Notification minutes before due time'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const current = await deps.taskService.get(ownerId, params.id);
      const user = await deps.userService.requireById(ownerId);

      const task = await deps.taskService.update(ownerId, user.email, params.id, {
        title: params.title ?? current.title,
        description: params.description !== undefined ? params.description : (current.description ?? undefined),
        status: params.status ?? current.status,
        priority: params.priority ?? current.priority,
        dueAt: params.dueAt !== undefined ? params.dueAt : (current.dueAt ? current.dueAt.toISOString() : undefined),
        notifyMinutesBefore: params.notifyMinutesBefore !== undefined ? params.notifyMinutesBefore : (current.notifyMinutesBefore ?? undefined),
        assigneeId: current.assigneeId,
      });
      return textResult(task);
    },
  );

  server.registerTool<any, any>(
    'complete_task',
    {
      description: 'Complete a task by setting its status to DONE',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const current = await deps.taskService.get(ownerId, params.id);
      if (current.status === 'DONE') {
        return textResult(current);
      }
      const user = await deps.userService.requireById(ownerId);
      const task = await deps.taskService.update(ownerId, user.email, params.id, {
        title: current.title,
        status: 'DONE',
        assigneeId: current.assigneeId,
      });
      return textResult(task);
    },
  );

  server.registerTool<any, any>(
    'delete_task',
    {
      description: 'Delete a task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      await deps.taskService.delete(ownerId, params.id);
      return textResult({ success: true, message: 'Task deleted' });
    },
  );

  server.registerTool<any, any>(
    'restore_task',
    {
      description: 'Restore a deleted task',
      inputSchema: {
        id: z.string().describe('Task ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const task = await deps.taskService.restore(ownerId, params.id);
      return textResult(task);
    },
  );
}

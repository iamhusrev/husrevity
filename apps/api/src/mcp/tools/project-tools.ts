import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { ProjectService } from '../../project/project.service';
import { getOwnerAndCheckScope, textResult, resolveByIdOrName } from './mcp-tool-helpers';

export interface ProjectToolsDeps {
  projectService: ProjectService;
}

export function registerProjectTools(server: McpServer, deps: ProjectToolsDeps) {
  server.registerTool<any, any>(
    'list_projects',
    {
      description: 'List projects accessible by the authenticated user with optional filter',
      inputSchema: {
        filter: z
          .enum(['all', 'mine', 'shared'])
          .optional()
          .describe('Filter projects by ownership: "all", "mine", or "shared"'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:read');
      const projects = await deps.projectService.list(ownerId, params?.filter);
      return textResult(projects);
    },
  );

  server.registerTool<any, any>(
    'get_project',
    {
      description: 'Get project details by project ID',
      inputSchema: {
        id: z.string().describe('Project ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:read');
      const project = await deps.projectService.getById(ownerId, params.id);
      return textResult(project);
    },
  );

  server.registerTool<any, any>(
    'create_project',
    {
      description: 'Create a new project',
      inputSchema: {
        code: z.string().describe('Alphanumeric project code'),
        name: z.string().describe('Project name'),
        description: z.string().optional().describe('Project description'),
        status: z.string().optional().describe('Project status'),
        startDate: z.string().optional().describe('Start date'),
        endDate: z.string().optional().describe('End date'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const project = await deps.projectService.create(ownerId, {
        code: params.code,
        name: params.name,
        description: params.description,
        status: params.status,
        startDate: params.startDate,
        endDate: params.endDate,
      });
      return textResult(project);
    },
  );

  server.registerTool<any, any>(
    'update_project',
    {
      description: 'Update a project. Omitted fields are not changed. Project can be given by id, code or name.',
      inputSchema: {
        id: z.string().describe('Project ID, code or name'),
        name: z.string().optional().describe('Project name'),
        description: z.string().optional().describe('Project description'),
        status: z.string().optional().describe('Project status'),
        startDate: z.string().optional().describe('Start date'),
        endDate: z.string().optional().describe('End date'),
        pinned: z.boolean().optional().describe('Pinned status'),
        archived: z.boolean().optional().describe('Archived status'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const projects = await deps.projectService.list(ownerId, 'all');
      const match = resolveByIdOrName(projects, params.id, 'Project');
      const project = await deps.projectService.update(ownerId, match.id, {
        name: params.name,
        description: params.description,
        status: params.status,
        startDate: params.startDate,
        endDate: params.endDate,
        pinned: params.pinned,
        archived: params.archived,
      });
      return textResult(project);
    },
  );

  server.registerTool<any, any>(
    'delete_project',
    {
      description: 'Delete a project.',
      inputSchema: {
        id: z.string().describe('Project ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      await deps.projectService.delete(ownerId, params.id);
      return textResult({ success: true, message: 'Project deleted' });
    },
  );

  server.registerTool<any, any>(
    'restore_project',
    {
      description: 'Restore a deleted project.',
      inputSchema: {
        id: z.string().describe('Project ID'),
      },
    },
    async (params: any, extra: any) => {
      const { ownerId } = getOwnerAndCheckScope(extra, 'projects:write');
      const project = await deps.projectService.restore(ownerId, params.id);
      return textResult(project);
    },
  );
}

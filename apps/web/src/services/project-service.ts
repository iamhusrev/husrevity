import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { AuthResponse } from "@/types/auth/auth-response";
import {
  AcceptProjectInviteResponse,
  AddProjectMemberRequest,
  AddProjectMemberResponse,
  ProjectInviteLookup,
  ProjectInviteResponse,
  ProjectMemberResponse,
  ProjectRequest,
  ProjectResponse,
  ProjectUpdateRequest,
  RegisterViaProjectInviteRequest,
  TaskRequest,
  TaskResponse,
  UpdateProjectMemberRoleRequest,
} from "@/types/project/project";
import { ReorderItem } from "@/types/common/reorder";
import {
  PROJECT_ENDPOINTS,
  PROJECT_INVITE_PUBLIC_ENDPOINTS,
  ProjectFilter,
} from "@/utils/api-endpoints";

export const projectService = {
  async listProjects(filter?: ProjectFilter): Promise<ApiResponse<ProjectResponse[]>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.LIST(filter));
    return res.data;
  },

  async getProject(id: number): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async createProject(body: ProjectRequest): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.post(PROJECT_ENDPOINTS.ALL, body);
    return res.data;
  },

  async updateProject(
    id: number,
    body: ProjectUpdateRequest,
  ): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.put(PROJECT_ENDPOINTS.BY_ID(id), body);
    return res.data;
  },

  async deleteProject(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PROJECT_ENDPOINTS.BY_ID(id));
    return res.data;
  },

  async restoreProject(id: number): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.patch(PROJECT_ENDPOINTS.RESTORE(id));
    return res.data;
  },

  async listTasks(id: number): Promise<ApiResponse<TaskResponse[]>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.TASKS(id));
    return res.data;
  },

  async createTask(id: number, body: TaskRequest): Promise<ApiResponse<TaskResponse>> {
    const res = await apiClient.post(PROJECT_ENDPOINTS.TASKS(id), body);
    return res.data;
  },

  async reorderTasks(id: number, items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(PROJECT_ENDPOINTS.TASKS_REORDER(id), { items });
    return res.data;
  },

  async getTask(id: number): Promise<ApiResponse<TaskResponse>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.TASK_BY_ID(id));
    return res.data;
  },

  async updateTask(id: number, body: TaskRequest): Promise<ApiResponse<TaskResponse>> {
    const res = await apiClient.put(PROJECT_ENDPOINTS.TASK_BY_ID(id), body);
    return res.data;
  },

  async deleteTask(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PROJECT_ENDPOINTS.TASK_BY_ID(id));
    return res.data;
  },

  async restoreTask(id: number): Promise<ApiResponse<TaskResponse>> {
    const res = await apiClient.patch(PROJECT_ENDPOINTS.TASK_RESTORE(id));
    return res.data;
  },

  async listMembers(id: number): Promise<ApiResponse<ProjectMemberResponse[]>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.MEMBERS(id));
    return res.data;
  },

  async addMember(
    id: number,
    body: AddProjectMemberRequest,
  ): Promise<ApiResponse<AddProjectMemberResponse>> {
    const res = await apiClient.post(PROJECT_ENDPOINTS.MEMBERS(id), body);
    return res.data;
  },

  async updateMemberRole(
    id: number,
    memberId: number,
    body: UpdateProjectMemberRoleRequest,
  ): Promise<ApiResponse<ProjectMemberResponse>> {
    const res = await apiClient.patch(PROJECT_ENDPOINTS.MEMBER_BY_ID(id, memberId), body);
    return res.data;
  },

  async removeMember(id: number, memberId: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PROJECT_ENDPOINTS.MEMBER_BY_ID(id, memberId));
    return res.data;
  },

  async leaveProject(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PROJECT_ENDPOINTS.LEAVE(id));
    return res.data;
  },

  async listInvites(id: number): Promise<ApiResponse<ProjectInviteResponse[]>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.INVITES(id));
    return res.data;
  },

  async revokeInvite(id: number, inviteId: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PROJECT_ENDPOINTS.INVITE_BY_ID(id, inviteId));
    return res.data;
  },
};

/**
 * Public (no-auth) project-invite endpoints — used by the /project-invite/[token]
 * page (later phase) and by `accept`, which requires the caller to already be
 * authenticated. Kept on a separate object mirroring `invitePublicService` in
 * `admin-service.ts` so we don't conflate it with the authenticated project CRUD.
 */
export const projectInvitePublicService = {
  async lookup(token: string): Promise<ApiResponse<ProjectInviteLookup>> {
    const res = await apiClient.get(PROJECT_INVITE_PUBLIC_ENDPOINTS.LOOKUP(token));
    return res.data;
  },

  async accept(token: string): Promise<ApiResponse<AcceptProjectInviteResponse>> {
    const res = await apiClient.post(PROJECT_INVITE_PUBLIC_ENDPOINTS.ACCEPT(token));
    return res.data;
  },

  async register(
    token: string,
    body: RegisterViaProjectInviteRequest,
  ): Promise<ApiResponse<AuthResponse>> {
    const res = await apiClient.post(PROJECT_INVITE_PUBLIC_ENDPOINTS.REGISTER(token), body);
    return res.data;
  },
};

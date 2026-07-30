import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  ProjectRequest,
  ProjectResponse,
  ProjectUpdateRequest,
  TaskRequest,
  TaskResponse,
} from "@/types/project/project";
import { ReorderItem } from "@/types/common/reorder";
import { PROJECT_ENDPOINTS } from "@/utils/api-endpoints";

export const projectService = {
  async listProjects(): Promise<ApiResponse<ProjectResponse[]>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.ALL);
    return res.data;
  },

  async getProject(code: string): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.BY_CODE(code));
    return res.data;
  },

  async createProject(body: ProjectRequest): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.post(PROJECT_ENDPOINTS.ALL, body);
    return res.data;
  },

  async updateProject(
    code: string,
    body: ProjectUpdateRequest,
  ): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.put(PROJECT_ENDPOINTS.BY_CODE(code), body);
    return res.data;
  },

  async deleteProject(code: string): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(PROJECT_ENDPOINTS.BY_CODE(code));
    return res.data;
  },

  async restoreProject(code: string): Promise<ApiResponse<ProjectResponse>> {
    const res = await apiClient.patch(PROJECT_ENDPOINTS.RESTORE(code));
    return res.data;
  },

  async listTasks(code: string): Promise<ApiResponse<TaskResponse[]>> {
    const res = await apiClient.get(PROJECT_ENDPOINTS.TASKS(code));
    return res.data;
  },

  async createTask(code: string, body: TaskRequest): Promise<ApiResponse<TaskResponse>> {
    const res = await apiClient.post(PROJECT_ENDPOINTS.TASKS(code), body);
    return res.data;
  },

  async reorderTasks(code: string, items: ReorderItem[]): Promise<ApiResponse<void>> {
    const res = await apiClient.patch(PROJECT_ENDPOINTS.TASKS_REORDER(code), { items });
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
};

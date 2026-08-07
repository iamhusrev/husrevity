import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectService } from "@/services/project-service";
import {
  AddProjectMemberRequest,
  ProjectRequest,
  ProjectRole,
  ProjectUpdateRequest,
  TaskRequest,
  UpdateProjectMemberRoleRequest,
} from "@/types/project/project";
import { ReorderItem } from "@/types/common/reorder";
import { ProjectFilter } from "@/utils/api-endpoints";

const PROJECT_KEYS = {
  all: ["projects"] as const,
  list: (filter: ProjectFilter = "all") => ["projects", "list", filter] as const,
  detail: (id: number) => ["projects", id] as const,
  tasks: (id: number) => ["project-tasks", id] as const,
  task: (id: number) => ["task", id] as const,
  members: (id: number) => ["project-members", id] as const,
  invites: (id: number) => ["project-invites", id] as const,
};

export function useProjects(filter?: ProjectFilter) {
  return useQuery({
    queryKey: PROJECT_KEYS.list(filter ?? "all"),
    queryFn: () => projectService.listProjects(filter),
    select: (d) => d.data,
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: PROJECT_KEYS.detail(id),
    queryFn: () => projectService.getProject(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectRequest) => projectService.createProject(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_KEYS.all }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ProjectUpdateRequest }) =>
      projectService.updateProject(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectService.deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_KEYS.all }),
  });
}

export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectService.restoreProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_KEYS.all }),
  });
}

export function useProjectTasks(id: number) {
  return useQuery({
    queryKey: PROJECT_KEYS.tasks(id),
    queryFn: () => projectService.listTasks(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: number; body: TaskRequest }) =>
      projectService.createTask(projectId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.projectId) });
    },
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, items }: { projectId: number; items: ReorderItem[] }) =>
      projectService.reorderTasks(projectId, items),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.projectId) });
    },
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: PROJECT_KEYS.task(id),
    queryFn: () => projectService.getTask(id),
    select: (d) => d.data,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      projectId?: number;
      body: TaskRequest;
    }) => projectService.updateTask(id, body),
    onSuccess: (_, vars) => {
      if (vars.projectId) {
        qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.projectId) });
      }
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.task(vars.id) });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId?: number }) => projectService.deleteTask(id),
    onSuccess: (_, vars) => {
      if (vars.projectId) {
        qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.projectId) });
      }
    },
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId?: number }) => projectService.restoreTask(id),
    onSuccess: (_, vars) => {
      if (vars.projectId) {
        qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.projectId) });
      }
    },
  });
}

export function useProjectMembers(id: number) {
  return useQuery({
    queryKey: PROJECT_KEYS.members(id),
    queryFn: () => projectService.listMembers(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useAddProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AddProjectMemberRequest }) =>
      projectService.addMember(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.members(vars.id) });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.invites(vars.id) });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}

export function useUpdateProjectMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      memberId,
      body,
    }: {
      id: number;
      memberId: number;
      body: UpdateProjectMemberRoleRequest;
    }) => projectService.updateMemberRole(id, memberId, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.members(vars.id) });
    },
  });
}

export function useRemoveProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memberId }: { id: number; memberId: number }) =>
      projectService.removeMember(id, memberId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.members(vars.id) });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}

export function useLeaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectService.leaveProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_KEYS.all }),
  });
}

export function useProjectInvites(id: number) {
  return useQuery({
    queryKey: PROJECT_KEYS.invites(id),
    queryFn: () => projectService.listInvites(id),
    select: (d) => d.data,
    enabled: !!id,
  });
}

export function useRevokeProjectInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, inviteId }: { id: number; inviteId: number }) =>
      projectService.revokeInvite(id, inviteId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.invites(vars.id) });
    },
  });
}

export function useProjectRole(id: number): ProjectRole | undefined {
  return useProject(id).data?.role;
}

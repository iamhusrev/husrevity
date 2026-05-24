import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectService } from "@/services/project-service";
import { ProjectRequest, ProjectUpdateRequest, TaskRequest } from "@/types/project/project";
import { ReorderItem } from "@/types/common/reorder";

const PROJECT_KEYS = {
  all: ["projects"] as const,
  detail: (code: string) => ["projects", code] as const,
  tasks: (code: string) => ["project-tasks", code] as const,
  task: (id: number) => ["task", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: PROJECT_KEYS.all,
    queryFn: () => projectService.listProjects(),
    select: (d) => d.data,
  });
}

export function useProject(code: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.detail(code),
    queryFn: () => projectService.getProject(code),
    select: (d) => d.data,
    enabled: !!code,
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
    mutationFn: ({ code, body }: { code: string; body: ProjectUpdateRequest }) =>
      projectService.updateProject(code, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(vars.code) });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => projectService.deleteProject(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_KEYS.all }),
  });
}

export function useProjectTasks(code: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.tasks(code),
    queryFn: () => projectService.listTasks(code),
    select: (d) => d.data,
    enabled: !!code,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, body }: { code: string; body: TaskRequest }) =>
      projectService.createTask(code, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.code) });
    },
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, items }: { code: string; items: ReorderItem[] }) =>
      projectService.reorderTasks(code, items),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.code) });
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
    mutationFn: ({ id, body }: { id: number; code?: string; body: TaskRequest }) =>
      projectService.updateTask(id, body),
    onSuccess: (_, vars) => {
      if (vars.code) {
        qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.code) });
      }
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.task(vars.id) });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; code?: string }) => projectService.deleteTask(id),
    onSuccess: (_, vars) => {
      if (vars.code) {
        qc.invalidateQueries({ queryKey: PROJECT_KEYS.tasks(vars.code) });
      }
    },
  });
}

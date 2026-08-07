export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ProjectRole = "OWNER" | "EDITOR" | "VIEWER";

export interface ProjectResponse {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  ownerId: number;
  ownerName: string | null;
  role: ProjectRole;
  shared: boolean;
  memberCount: number;
}

export interface ProjectRequest {
  code: string;
  name: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ProjectUpdateRequest {
  name?: string;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export interface TaskResponse {
  id: number;
  ownerId?: number | null;
  projectId?: number | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string | null;
  position: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
}

export interface TaskRequest {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  projectId?: number | null;
  assigneeId?: number | null;
}

export interface ProjectMemberResponse {
  id: number;
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ProjectRole;
  joinedAt: string;
}

export interface ProjectInviteResponse {
  id: number;
  email: string;
  role: Exclude<ProjectRole, "OWNER">;
  expiresAt: string;
  createdAt: string;
}

export interface AddProjectMemberRequest {
  email: string;
  role: Exclude<ProjectRole, "OWNER">;
}

export interface AddProjectMemberResponse {
  member: ProjectMemberResponse | null;
  invite: ProjectInviteResponse | null;
  inviteUrl: string | null;
  emailDelivered: boolean;
}

export interface UpdateProjectMemberRoleRequest {
  role: Exclude<ProjectRole, "OWNER">;
}

export interface ProjectInviteLookup {
  projectName: string;
  projectCode: string;
  email: string;
  role: Exclude<ProjectRole, "OWNER">;
  invitedByEmail: string;
  expiresAt: string;
  requiresRegistration: boolean;
}

export interface AcceptProjectInviteResponse {
  projectId: number;
  role: ProjectRole;
}

export interface RegisterViaProjectInviteRequest {
  password: string;
  firstName?: string;
  lastName?: string;
}

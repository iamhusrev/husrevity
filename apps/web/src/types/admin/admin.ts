export type Role = "user" | "admin";

export interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  role: string;
  emailNotificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
}

export interface AdminUpdateUserRequest {
  firstName?: string | null;
  lastName?: string | null;
  role?: Role;
  enabled?: boolean;
}

export interface AdminResetPasswordRequest {
  newPassword: string;
}

export interface CreateInviteRequest {
  email: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
}

export interface InviteResponse {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  createdAt: string;
}

export interface CreatedInviteResponse extends InviteResponse {
  inviteUrl: string;
  emailDelivered: boolean;
}

export interface InviteLookup {
  email: string;
  firstName: string | null;
  lastName: string | null;
  expiresAt: string;
  invitedByEmail: string;
}

export interface AcceptInviteRequest {
  password: string;
  firstName?: string;
  lastName?: string;
}

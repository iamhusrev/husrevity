import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import {
  AcceptInviteRequest,
  AdminResetPasswordRequest,
  AdminUpdateUserRequest,
  AdminUser,
  AdminUserListResponse,
  CreateInviteRequest,
  CreatedInviteResponse,
  InviteLookup,
  InviteResponse,
} from "@/types/admin/admin";
import { AuthResponse } from "@/types/auth/auth-response";
import {
  ADMIN_ENDPOINTS,
  INVITE_PUBLIC_ENDPOINTS,
} from "@/utils/api-endpoints";

export const adminService = {
  // Users
  async listUsers(params: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<AdminUserListResponse>> {
    const r = await apiClient.get(ADMIN_ENDPOINTS.USERS, { params });
    return r.data;
  },
  async updateUser(
    id: string,
    body: AdminUpdateUserRequest,
  ): Promise<ApiResponse<AdminUser>> {
    const r = await apiClient.patch(ADMIN_ENDPOINTS.USER_BY_ID(id), body);
    return r.data;
  },
  async resetPassword(
    id: string,
    body: AdminResetPasswordRequest,
  ): Promise<ApiResponse<void>> {
    const r = await apiClient.post(ADMIN_ENDPOINTS.RESET_PASSWORD(id), body);
    return r.data;
  },
  async deleteUser(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(ADMIN_ENDPOINTS.USER_BY_ID(id));
    return r.data;
  },

  // Invites (admin)
  async listInvites(): Promise<ApiResponse<InviteResponse[]>> {
    const r = await apiClient.get(ADMIN_ENDPOINTS.INVITES);
    return r.data;
  },
  async createInvite(
    body: CreateInviteRequest,
  ): Promise<ApiResponse<CreatedInviteResponse>> {
    const r = await apiClient.post(ADMIN_ENDPOINTS.INVITES, body);
    return r.data;
  },
  async revokeInvite(id: string): Promise<ApiResponse<void>> {
    const r = await apiClient.delete(ADMIN_ENDPOINTS.INVITE_BY_ID(id));
    return r.data;
  },
};

/**
 * Public (no-auth) invite endpoints — used by the /invite/[token] page.
 * Kept on a separate object so we don't accidentally call them with an
 * Authorization header (api-client adds one automatically when a token is
 * cached). Frontend uses the same axios instance but the API doesn't require
 * a token for these endpoints.
 */
export const invitePublicService = {
  async lookup(token: string): Promise<ApiResponse<InviteLookup>> {
    const r = await apiClient.get(INVITE_PUBLIC_ENDPOINTS.LOOKUP(token));
    return r.data;
  },
  async accept(
    token: string,
    body: AcceptInviteRequest,
  ): Promise<ApiResponse<AuthResponse>> {
    const r = await apiClient.post(
      INVITE_PUBLIC_ENDPOINTS.ACCEPT(token),
      body,
    );
    return r.data;
  },
};

import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";

export interface LinkStatus {
  configured: boolean;
  linked: boolean;
  botUsername: string | null;
  linkedAt: string | null;
  pendingCode: string | null;
  pendingCodeExpiresAt: string | null;
}

export interface LinkCode {
  code: string;
  botUsername: string | null;
  expiresAt: string;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
}

export type PatScope =
  | "items:read"
  | "items:write"
  | "notes:read"
  | "notes:write"
  | "projects:read"
  | "projects:write";

export const PAT_SCOPES: PatScope[] = [
  "items:read",
  "items:write",
  "notes:read",
  "notes:write",
  "projects:read",
  "projects:write",
];

export interface Pat {
  id: string;
  name: string;
  scopes: PatScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export type ChatProvider = "telegram" | "slack";

export const integrationsService = {
  async linkStatus(provider: ChatProvider): Promise<LinkStatus> {
    const res = await apiClient.get<ApiResponse<LinkStatus>>(`/${provider}/status`);
    return res.data.data;
  },
  async createLinkCode(provider: ChatProvider): Promise<LinkCode> {
    const res = await apiClient.post<ApiResponse<LinkCode>>(`/${provider}/link-code`);
    return res.data.data;
  },
  async unlink(provider: ChatProvider): Promise<void> {
    await apiClient.delete(`/${provider}/link`);
  },

  async googleStatus(): Promise<GoogleStatus> {
    const res = await apiClient.get<ApiResponse<GoogleStatus>>(
      "/integrations/google-calendar/status",
    );
    return res.data.data;
  },
  async googleConnectUrl(): Promise<string> {
    const res = await apiClient.get<ApiResponse<{ url: string }>>(
      "/integrations/google-calendar/connect-url",
    );
    return res.data.data.url;
  },
  async googleDisconnect(): Promise<void> {
    await apiClient.delete("/integrations/google-calendar");
  },

  async listPats(): Promise<Pat[]> {
    const res = await apiClient.get<ApiResponse<Pat[]>>("/pat");
    return res.data.data;
  },
  async issuePat(name: string, scopes: PatScope[]): Promise<{ id: string; token: string }> {
    const res = await apiClient.post<ApiResponse<{ id: string; token: string }>>("/pat", {
      name,
      scopes,
    });
    return res.data.data;
  },
  async revokePat(id: string): Promise<void> {
    await apiClient.delete(`/pat/${id}`);
  },
};

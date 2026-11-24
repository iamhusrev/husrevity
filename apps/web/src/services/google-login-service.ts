"use client";

import apiClient from "@/services/api-client";
import { AuthResponse } from "@/types/auth/auth-response";
import { ApiResponse } from "@/types/common/api-response";
import { GOOGLE_AUTH_ENDPOINTS } from "@/utils/api-endpoints";
import { beginPkce } from "@/utils/google-pkce";

export type GoogleExchangeResult =
  | ({ purpose: "login" } & AuthResponse)
  | { purpose: "link"; linked: true; email: string };

export interface GoogleIdentityStatus {
  linked: boolean;
  email: string | null;
  passwordLoginEnabled: boolean;
}

function startUrl(params: Record<string, string>): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  return `${base}${GOOGLE_AUTH_ENDPOINTS.START}?${new URLSearchParams(params).toString()}`;
}

export const GoogleLoginService = {
  async isEnabled(): Promise<boolean> {
    try {
      const res = await apiClient.get<ApiResponse<{ enabled: boolean }>>(
        GOOGLE_AUTH_ENDPOINTS.CONFIG,
      );
      return res.data.data?.enabled === true;
    } catch {
      return false;
    }
  },

  /** Full-page navigation: the API sets a flow cookie and redirects to Google. */
  async startLogin(): Promise<void> {
    const { challenge } = await beginPkce();
    window.location.assign(startUrl({ code_challenge: challenge }));
  },

  async startLink(): Promise<void> {
    const { challenge } = await beginPkce();
    const res = await apiClient.post<ApiResponse<{ ticket: string }>>(
      GOOGLE_AUTH_ENDPOINTS.LINK_START,
      { codeChallenge: challenge },
    );
    window.location.assign(startUrl({ ticket: res.data.data.ticket }));
  },

  async exchange(code: string, verifier: string): Promise<GoogleExchangeResult> {
    const res = await apiClient.post<ApiResponse<GoogleExchangeResult>>(
      GOOGLE_AUTH_ENDPOINTS.EXCHANGE,
      { code, verifier },
    );
    return res.data.data;
  },

  async getIdentity(): Promise<GoogleIdentityStatus> {
    const res = await apiClient.get<ApiResponse<GoogleIdentityStatus>>(
      GOOGLE_AUTH_ENDPOINTS.IDENTITY,
    );
    return res.data.data;
  },

  async unlink(): Promise<void> {
    await apiClient.delete(GOOGLE_AUTH_ENDPOINTS.IDENTITY);
  },
};

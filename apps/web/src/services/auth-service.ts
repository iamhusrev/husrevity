"use client";

import apiClient from "@/services/api-client";
import { LoginRequest } from "@/types/auth/login-request";
import { RegisterRequest } from "@/types/auth/register-request";
import { AuthResponse } from "@/types/auth/auth-response";
import { ApiResponse } from "@/types/common/api-response";
import {
  ChangePasswordRequest,
  NotificationPreferencesRequest,
  UpdateProfileRequest,
  UserResponse,
} from "@/types/user/user";
import { AUTH_ENDPOINTS } from "@/utils/api-endpoints";
import { LOCAL_STORAGE_KEYS } from "@/utils/constants-common";

export const AuthService = {
  async login(request: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(AUTH_ENDPOINTS.LOGIN, request);

    const auth = response.data.data;
    AuthService.persistAuth(auth);

    return auth;
  },

  async register(request: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      AUTH_ENDPOINTS.REGISTER,
      request,
    );

    const auth = response.data.data;
    AuthService.persistAuth(auth);

    return auth;
  },

  async refreshToken(): Promise<AuthResponse | null> {
    const refreshToken = AuthService.getStoredRefreshToken();
    if (!refreshToken) return null;

    const response = await apiClient.post<ApiResponse<AuthResponse>>(AUTH_ENDPOINTS.REFRESH, {
      refreshToken,
    });

    const auth = response.data.data;
    AuthService.persistAuth(auth);

    return auth;
  },

  async logout(): Promise<void> {
    const refreshToken = AuthService.getStoredRefreshToken();
    if (refreshToken) {
      try {
        await apiClient.post(AUTH_ENDPOINTS.LOGOUT, { refreshToken });
      } catch {
        // ignore errors during logout
      }
    }
    AuthService.clearStorage();
  },

  async getMe(): Promise<UserResponse> {
    const response = await apiClient.get<ApiResponse<UserResponse>>(AUTH_ENDPOINTS.ME);
    const user = response.data.data;
    AuthService.setStoredUser(user);
    return user;
  },

  async updateProfile(body: UpdateProfileRequest): Promise<UserResponse> {
    const response = await apiClient.put<ApiResponse<UserResponse>>(AUTH_ENDPOINTS.ME, body);
    const user = response.data.data;
    AuthService.setStoredUser(user);
    return user;
  },

  async changePassword(body: ChangePasswordRequest): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.ME_PASSWORD, body);
  },

  async updateNotificationPreferences(
    body: NotificationPreferencesRequest,
  ): Promise<UserResponse> {
    const response = await apiClient.patch<ApiResponse<UserResponse>>(
      AUTH_ENDPOINTS.ME_NOTIFICATION_PREFERENCES,
      body,
    );
    const user = response.data.data;
    AuthService.setStoredUser(user);
    return user;
  },

  persistAuth(auth: AuthResponse): void {
    localStorage.setItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN, auth.accessToken);
    localStorage.setItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN, auth.refreshToken);
    if (auth.user) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(auth.user));
    }
  },

  setStoredUser(user: UserResponse): void {
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(user));
  },

  clearStorage(): void {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
  },

  getStoredUser(): UserResponse | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
    return stored ? JSON.parse(stored) : null;
  },

  getStoredToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
  },

  getStoredRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
  },
};

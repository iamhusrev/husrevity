// Axios client with interceptors
// Handles JWT Bearer token injection and 401 refresh

import axios, { AxiosError, CanceledError } from "axios";
import { LOCAL_STORAGE_KEYS } from "@/utils/constants-common";
import { authEvents } from "@/services/auth-events";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Request Interceptor - inject Bearer token
apiClient.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;

  const token = localStorage.getItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response Interceptor - auto-refresh on 401
apiClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest: any = error.config;

    // Auth endpoints must never trigger refresh
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/");

    const status = error.response?.status;
    if (
      (status === 401 || status === 403) &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      typeof window !== "undefined"
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN);

        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });

        const data = refreshResponse.data?.data;
        const newAccessToken = data?.accessToken;
        const newRefreshToken = data?.refreshToken;

        if (newAccessToken) {
          localStorage.setItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);
          if (newRefreshToken) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
          }
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        return apiClient(originalRequest);
      } catch (refreshError) {
        authEvents.emitForceLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
export { CanceledError };

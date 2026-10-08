export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  code: number;
  data: T;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public data?: any,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  skipAuth?: boolean;
  _retry?: boolean;
}

export const ACCESS_TOKEN_KEY = "husrevity_access_token";
export const REFRESH_TOKEN_KEY = "husrevity_refresh_token";

const inMemoryStorage = new Map<string, string>();

function getSecureStore() {
  try {
    return require("expo-secure-store");
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const store = getSecureStore();
    if (store && typeof store.getItemAsync === "function") {
      const val = await store.getItemAsync(ACCESS_TOKEN_KEY);
      if (val !== null && val !== undefined) return val;
    }
  } catch {
    // fallback
  }
  return inMemoryStorage.get(ACCESS_TOKEN_KEY) ?? null;
}

export async function setAccessToken(token: string): Promise<void> {
  inMemoryStorage.set(ACCESS_TOKEN_KEY, token);
  try {
    const store = getSecureStore();
    if (store && typeof store.setItemAsync === "function") {
      await store.setItemAsync(ACCESS_TOKEN_KEY, token);
    }
  } catch {
    // ignore secure store write failure in non-native env
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    const store = getSecureStore();
    if (store && typeof store.getItemAsync === "function") {
      const val = await store.getItemAsync(REFRESH_TOKEN_KEY);
      if (val !== null && val !== undefined) return val;
    }
  } catch {
    // fallback
  }
  return inMemoryStorage.get(REFRESH_TOKEN_KEY) ?? null;
}

export async function setRefreshToken(token: string): Promise<void> {
  inMemoryStorage.set(REFRESH_TOKEN_KEY, token);
  try {
    const store = getSecureStore();
    if (store && typeof store.setItemAsync === "function") {
      await store.setItemAsync(REFRESH_TOKEN_KEY, token);
    }
  } catch {
    // fallback
  }
}

export async function clearTokens(): Promise<void> {
  inMemoryStorage.delete(ACCESS_TOKEN_KEY);
  inMemoryStorage.delete(REFRESH_TOKEN_KEY);
  try {
    const store = getSecureStore();
    if (store && typeof store.deleteItemAsync === "function") {
      await store.deleteItemAsync(ACCESS_TOKEN_KEY);
      await store.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

type LogoutListener = () => void;
const logoutListeners = new Set<LogoutListener>();

export function onForceLogout(listener: LogoutListener): () => void {
  logoutListeners.add(listener);
  return () => {
    logoutListeners.delete(listener);
  };
}

export function notifyForceLogout(): void {
  logoutListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore error in listener
    }
  });
}

export function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4090/api";
  return url.replace(/\/+$/, "");
}

let refreshPromise: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new ApiClientError("No refresh token stored", 401);
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/auth/refresh`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err: any) {
    throw new ApiClientError(err?.message || "Refresh request failed", 0);
  }

  if (!response.ok) {
    throw new ApiClientError(`Refresh failed with status ${response.status}`, response.status);
  }

  const text = await response.text();
  let json: ApiResponse<{ accessToken: string; refreshToken?: string }>;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiClientError("Invalid refresh response JSON", response.status);
  }

  const data = json?.data;
  const newAccessToken = data?.accessToken;
  const newRefreshToken = data?.refreshToken;

  if (!newAccessToken) {
    throw new ApiClientError("Refresh response missing access token", response.status);
  }

  await setAccessToken(newAccessToken);
  if (newRefreshToken) {
    await setRefreshToken(newRefreshToken);
  }

  return newAccessToken;
}

export async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { skipAuth = false, _retry = false, headers = {}, ...restInit } = options;

  const baseUrl = getBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (!skipAuth) {
    const token = await getAccessToken();
    if (token) {
      reqHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...restInit,
      headers: reqHeaders,
    });
  } catch (networkError: any) {
    throw new ApiClientError(networkError?.message || "Network request failed", 0);
  }

  const isAuthEndpoint = cleanEndpoint.includes("/auth/");

  if (
    (response.status === 401 || response.status === 403) &&
    !_retry &&
    !isAuthEndpoint &&
    !skipAuth
  ) {
    let newAccessToken: string;
    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      newAccessToken = await refreshPromise;
    } catch (refreshErr) {
      await clearTokens();
      notifyForceLogout();
      throw refreshErr;
    }

    // Only a failed refresh forces a logout. An error from the retried
    // request itself (400/500/network) must propagate as-is — logging the
    // user out over it would be wrong once the token was refreshed fine.
    return request<T>(endpoint, {
      ...options,
      _retry: true,
      headers: {
        ...headers,
        Authorization: `Bearer ${newAccessToken}`,
      },
    });
  }

  const text = await response.text();
  let json: ApiResponse<T>;
  if (!text) {
    if (!response.ok) {
      throw new ApiClientError(`HTTP ${response.status}`, response.status);
    }
    return {
      success: true,
      message: "",
      code: response.status,
      data: undefined as any,
    };
  }

  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiClientError("Failed to parse response JSON", response.status);
  }

  if (!response.ok || (json && json.success === false)) {
    throw new ApiClientError(
      json?.message || `HTTP ${response.status}`,
      response.status,
      json?.code,
      json?.data,
    );
  }

  return json;
}

export const apiClient = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "GET" }),
  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body:
        body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    }),
  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "PUT",
      body:
        body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    }),
  patch: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body:
        body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    }),
  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),
};

export default apiClient;

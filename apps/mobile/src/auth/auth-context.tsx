import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { router } from "expo-router";
import {
  apiClient,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
  onForceLogout,
} from "../api/client";
import {
  registerPushNotification,
  unregisterPushNotification,
} from "../notifications/register-push";

export interface MobileUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
  enabled?: boolean;
}

export interface AuthContextValue {
  token: string | null;
  user: MobileUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    try {
      const res = await apiClient.get<MobileUser>("/me");
      if (res.data) {
        setUser(res.data);
      }
    } catch {
      // If fetching /me fails, apiClient handles errors or force logout
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const storedToken = await getAccessToken();
        if (storedToken) {
          if (isMounted) setToken(storedToken);
          try {
            const res = await apiClient.get<MobileUser>("/me");
            if (isMounted && res.data) {
              setUser(res.data);
              registerPushNotification().catch(() => {});
            }
          } catch {
            // ignore initial profile fetch error
          }
        }
      } catch {
        // ignore storage error
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    const unsubscribe = onForceLogout(() => {
      if (isMounted) {
        setToken(null);
        setUser(null);
        try {
          router.replace("/login");
        } catch {
          // ignore navigation error if router not initialized
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const res = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        user: MobileUser;
      }>("/auth/login", { email, password }, { skipAuth: true });

      const { accessToken, refreshToken, user: userProfile } = res.data;

      await setAccessToken(accessToken);
      if (refreshToken) {
        await setRefreshToken(refreshToken);
      }

      setToken(accessToken);
      setUser(userProfile);
      registerPushNotification().catch(() => {});

      try {
        router.replace("/today");
      } catch {
        // ignore navigation error if router unmounted
      }
    } catch (err: any) {
      const msg = err?.message || "Giriş yapılırken bir hata oluştu.";
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    // Must run while the access token is still stored (it authenticates the call).
    await unregisterPushNotification();
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // ignore network errors during logout
    } finally {
      await clearTokens();
      setToken(null);
      setUser(null);
      try {
        router.replace("/login");
      } catch {
        // ignore navigation error
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        isLoading,
        error,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthService } from "@/services/auth-service";
import { authEvents } from "@/services/auth-events";
import { pushService } from "@/services/push-service";
import { HOME_PAGE, LOGIN_PAGE } from "@/utils/constants-url";
import { LOCAL_STORAGE_KEYS } from "@/utils/constants-common";
import { UserResponse } from "@/types/user/user";
import { LoginRequest } from "@/types/auth/login-request";
import { RegisterRequest } from "@/types/auth/register-request";

interface AuthContextValue {
  token: string | null;
  user: UserResponse | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  applyUser: (user: UserResponse) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = AuthService.getStoredToken();
    const storedUser = AuthService.getStoredUser();

    if (storedToken) {
      setToken(storedToken);
      if (storedUser) setUser(storedUser);
    }

    setLoading(false);
  }, []);

  // Re-establish Web Push subscription on every authenticated app boot. No-op
  // if the user never opted in, or if browser permission isn't granted. Runs
  // detached so it never blocks render.
  useEffect(() => {
    if (!token) return;
    void pushService.registerIfPreviouslyEnabled();
  }, [token]);

  const login = async (req: LoginRequest) => {
    const auth = await AuthService.login(req);
    setToken(auth.accessToken);
    setUser(auth.user);
    router.push(HOME_PAGE);
  };

  const register = async (req: RegisterRequest) => {
    const auth = await AuthService.register(req);
    setToken(auth.accessToken);
    setUser(auth.user);
    router.push(HOME_PAGE);
  };

  const logout = async () => {
    await AuthService.logout();
    setToken(null);
    setUser(null);
    router.push(LOGIN_PAGE);
  };

  const applyUser = (next: UserResponse) => {
    setUser(next);
    AuthService.setStoredUser(next);
  };

  const refreshUser = async () => {
    const me = await AuthService.getMe();
    setUser(me);
  };

  // Force-logout: triggered when refresh fails or token is no longer valid.
  // Skips backend /logout call (refresh token already invalid) and redirects.
  useEffect(() => {
    const handleForceLogout = () => {
      AuthService.clearStorage();
      setToken(null);
      setUser(null);
      router.replace(LOGIN_PAGE);
    };

    const unsubscribe = authEvents.onForceLogout(handleForceLogout);

    // Cross-tab sync: another tab cleared the access token → log out here too.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEYS.ACCESS_TOKEN && e.newValue === null) {
        setToken(null);
        setUser(null);
        router.replace(LOGIN_PAGE);
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        loading,
        login,
        register,
        logout,
        applyUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};

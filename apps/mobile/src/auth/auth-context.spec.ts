import { describe, it, expect, beforeEach, afterEach, mock, beforeAll } from "bun:test";

const memoryStore = new Map<string, string>();
const routerReplaceMock = mock();

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { create: (s: any) => s },
  Text: () => null,
  View: () => null,
  TextInput: () => null,
  TouchableOpacity: () => null,
  ActivityIndicator: () => null,
  KeyboardAvoidingView: () => null,
  ScrollView: () => null,
  SafeAreaView: () => null,
}));

mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memoryStore.get(key) ?? null,
  setItemAsync: async (key: string, val: string) => {
    memoryStore.set(key, val);
  },
  deleteItemAsync: async (key: string) => {
    memoryStore.delete(key);
  },
}));

mock.module("expo-notifications", () => ({
  setNotificationHandler: mock(),
  getPermissionsAsync: async () => ({ granted: true, status: "granted" }),
  requestPermissionsAsync: async () => ({ granted: true, status: "granted" }),
  getExpoPushTokenAsync: async () => ({ data: "mock-token" }),
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
}));

mock.module("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "test-id" } } } },
}));

mock.module("@react-native/assets-registry/registry", () => ({
  registerAsset: () => 1,
  getAssetByID: () => null,
}));

mock.module("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => `Redirect(${href})`,
  Stack: Object.assign(({ children }: any) => children, { Screen: () => null }),
  Tabs: Object.assign(({ children }: any) => children, { Screen: () => null }),
  router: {
    replace: routerReplaceMock,
    push: mock(),
  },
}));

import React from "react";
import {
  setAccessToken,
  setRefreshToken,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  apiClient,
} from "../api/client";

describe("Mobile AuthContext & AuthProvider", () => {
  const originalFetch = global.fetch;
  let useAuth: any;
  let AuthProvider: any;

  beforeAll(async () => {
    const authModule = await import("./auth-context");
    useAuth = authModule.useAuth;
    AuthProvider = authModule.AuthProvider;
  });

  beforeEach(async () => {
    memoryStore.clear();
    await clearTokens();
    routerReplaceMock.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should throw error if useAuth is called outside AuthProvider component", () => {
    expect(() => useAuth()).toThrow();
  });

  it("should handle login success flow and store tokens", async () => {
    global.fetch = mock(async (url: any, init?: any) => {
      const urlStr = url.toString();
      if (urlStr.endsWith("/auth/login")) {
        const body = JSON.parse(init?.body as string);
        if (body.email === "test@example.com" && body.password === "secret123") {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Logged in",
              code: 200,
              data: {
                accessToken: "access_token_123",
                refreshToken: "refresh_token_456",
                user: { id: "u1", email: "test@example.com" },
              },
            }),
            { status: 200 },
          );
        }
      }
      return new Response(
        JSON.stringify({ success: false, message: "Invalid credentials", code: 401 }),
        { status: 401 },
      );
    }) as any;

    const res = await apiClient.post<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string };
    }>("/auth/login", { email: "test@example.com", password: "secret123" }, { skipAuth: true });

    expect(res.data.accessToken).toBe("access_token_123");
    await setAccessToken(res.data.accessToken);
    await setRefreshToken(res.data.refreshToken);

    expect(await getAccessToken()).toBe("access_token_123");
    expect(await getRefreshToken()).toBe("refresh_token_456");
  });

  it("should clear tokens on logout", async () => {
    await setAccessToken("token_to_clear");
    await setRefreshToken("refresh_to_clear");

    expect(await getAccessToken()).toBe("token_to_clear");

    await clearTokens();

    expect(await getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });
});

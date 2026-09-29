import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

const memoryStore = new Map<string, string>();

mock.module("react-native", () => ({}));

mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memoryStore.get(key) ?? null,
  setItemAsync: async (key: string, val: string) => {
    memoryStore.set(key, val);
  },
  deleteItemAsync: async (key: string) => {
    memoryStore.delete(key);
  },
}));

import {
  apiClient,
  setAccessToken,
  setRefreshToken,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  onForceLogout,
  getBaseUrl,
  ApiClientError,
} from "./client";

describe("Mobile ApiClient", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(async () => {
    memoryStore.clear();
    await clearTokens();
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_API_URL;
    }
  });

  describe("Base URL & Tokens", () => {
    it("should resolve default base URL when env var is not set", () => {
      expect(getBaseUrl()).toBe("http://localhost:4090/api");
    });

    it("should strip trailing slashes from custom env base URL", () => {
      process.env.EXPO_PUBLIC_API_URL = "https://my-api.example.com/api///";
      expect(getBaseUrl()).toBe("https://my-api.example.com/api");
    });

    it("should set, get, and clear tokens", async () => {
      await setAccessToken("access_123");
      await setRefreshToken("refresh_456");

      expect(await getAccessToken()).toBe("access_123");
      expect(await getRefreshToken()).toBe("refresh_456");

      await clearTokens();

      expect(await getAccessToken()).toBeNull();
      expect(await getRefreshToken()).toBeNull();
    });
  });

  describe("Request Execution & Headers", () => {
    it("should perform GET request with Bearer token and JSON headers", async () => {
      await setAccessToken("test_access_token");

      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      global.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedInit = init;
        return new Response(
          JSON.stringify({
            success: true,
            message: "OK",
            code: 200,
            data: { id: "1", title: "Test Item" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      const res = await apiClient.get<{ id: string; title: string }>("/items/1");

      expect(capturedUrl).toBe("http://localhost:4090/api/items/1");
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test_access_token");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(res.data).toEqual({ id: "1", title: "Test Item" });
    });

    it("should perform POST request with body and skip auth when skipAuth is true", async () => {
      await setAccessToken("test_access_token");

      let capturedInit: RequestInit | undefined;

      global.fetch = mock(async (_url: any, init?: RequestInit) => {
        capturedInit = init;
        return new Response(
          JSON.stringify({
            success: true,
            message: "Created",
            code: 201,
            data: { token: "new_token" },
          }),
          { status: 201 }
        );
      }) as any;

      const res = await apiClient.post(
        "/auth/login",
        { email: "user@example.com", password: "password123" },
        { skipAuth: true }
      );

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
      expect(capturedInit?.body).toBe(
        JSON.stringify({ email: "user@example.com", password: "password123" })
      );
      expect(res.data).toEqual({ token: "new_token" });
    });

    it("should throw ApiClientError when response is not ok", async () => {
      global.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Bad request error",
            code: 400,
          }),
          { status: 400 }
        );
      }) as any;

      try {
        await apiClient.get("/invalid-endpoint");
        expect(true).toBe(false); // Should not reach here
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect(err.status).toBe(400);
        expect(err.message).toBe("Bad request error");
      }
    });
  });

  describe("Automatic Token Refresh on 401", () => {
    it("should auto-refresh access token on 401 and retry original request", async () => {
      await setAccessToken("expired_token");
      await setRefreshToken("valid_refresh_token");

      let fetchCallCount = 0;
      let refreshCallPayload: any = null;
      let retryAuthorizationHeader: string | undefined = undefined;

      global.fetch = mock(async (url: any, init?: RequestInit) => {
        fetchCallCount++;
        const urlStr = url.toString();

        if (urlStr.endsWith("/items") && fetchCallCount === 1) {
          // First attempt returns 401
          return new Response(
            JSON.stringify({ success: false, message: "Unauthorized", code: 401 }),
            { status: 401 }
          );
        }

        if (urlStr.endsWith("/auth/refresh")) {
          refreshCallPayload = JSON.parse(init?.body as string);
          return new Response(
            JSON.stringify({
              success: true,
              message: "Refreshed",
              code: 200,
              data: {
                accessToken: "new_access_token_777",
                refreshToken: "new_refresh_token_888",
              },
            }),
            { status: 200 }
          );
        }

        if (urlStr.endsWith("/items") && fetchCallCount === 3) {
          // Retry attempt
          const headers = init?.headers as Record<string, string>;
          retryAuthorizationHeader = headers["Authorization"];
          return new Response(
            JSON.stringify({
              success: true,
              message: "Success",
              code: 200,
              data: [{ id: "1" }],
            }),
            { status: 200 }
          );
        }

        return new Response("{}", { status: 500 });
      }) as any;

      const res = await apiClient.get("/items");

      expect(fetchCallCount).toBe(3);
      expect(refreshCallPayload).toEqual({ refreshToken: "valid_refresh_token" });
      expect(retryAuthorizationHeader).toBe("Bearer new_access_token_777");
      expect(await getAccessToken()).toBe("new_access_token_777");
      expect(await getRefreshToken()).toBe("new_refresh_token_888");
      expect(res.data).toEqual([{ id: "1" }]);
    });

    it("should handle single-flight refresh for concurrent 401 requests", async () => {
      await setAccessToken("expired_token");
      await setRefreshToken("valid_refresh_token");

      let refreshCallCount = 0;

      global.fetch = mock(async (url: any, init?: RequestInit) => {
        const urlStr = url.toString();

        if (urlStr.endsWith("/auth/refresh")) {
          refreshCallCount++;
          await new Promise((r) => setTimeout(r, 20));
          return new Response(
            JSON.stringify({
              success: true,
              message: "Refreshed",
              code: 200,
              data: { accessToken: "shared_new_token" },
            }),
            { status: 200 }
          );
        }

        const headers = (init?.headers || {}) as Record<string, string>;
        if (headers["Authorization"] === "Bearer expired_token") {
          return new Response(
            JSON.stringify({ success: false, message: "Unauthorized", code: 401 }),
            { status: 401 }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "OK",
            code: 200,
            data: { authUsed: headers["Authorization"] },
          }),
          { status: 200 }
        );
      }) as any;

      const [res1, res2] = await Promise.all([
        apiClient.get("/resource-a"),
        apiClient.get("/resource-b"),
      ]);

      expect(refreshCallCount).toBe(1);
      expect(res1.data.authUsed).toBe("Bearer shared_new_token");
      expect(res2.data.authUsed).toBe("Bearer shared_new_token");
    });

    it("should trigger force logout and clear tokens when refresh fails", async () => {
      await setAccessToken("expired_token");
      await setRefreshToken("revoked_refresh_token");

      let logoutCalled = false;
      const unsubscribe = onForceLogout(() => {
        logoutCalled = true;
      });

      global.fetch = mock(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.endsWith("/auth/refresh")) {
          return new Response(
            JSON.stringify({ success: false, message: "Refresh token revoked", code: 401 }),
            { status: 401 }
          );
        }
        return new Response(
          JSON.stringify({ success: false, message: "Unauthorized", code: 401 }),
          { status: 401 }
        );
      }) as any;

      try {
        await apiClient.get("/protected-route");
        expect(true).toBe(false);
      } catch (err) {
        expect(logoutCalled).toBe(true);
        expect(await getAccessToken()).toBeNull();
        expect(await getRefreshToken()).toBeNull();
      } finally {
        unsubscribe();
      }
    });

    it("should NOT force logout when refresh succeeds but the retried request fails with a non-auth error", async () => {
      await setAccessToken("expired_token");
      await setRefreshToken("valid_refresh_token");

      let logoutCalled = false;
      const unsubscribe = onForceLogout(() => {
        logoutCalled = true;
      });

      global.fetch = mock(async (url: any, init: any) => {
        const urlStr = url.toString();
        if (urlStr.endsWith("/auth/refresh")) {
          return new Response(
            JSON.stringify({ success: true, message: "ok", code: 200, data: { accessToken: "fresh_token", refreshToken: "fresh_refresh" } }),
            { status: 200 },
          );
        }
        if (init?.headers?.Authorization === "Bearer fresh_token") {
          return new Response(
            JSON.stringify({ success: false, message: "Validation failed", code: 400 }),
            { status: 400 },
          );
        }
        return new Response(
          JSON.stringify({ success: false, message: "Unauthorized", code: 401 }),
          { status: 401 },
        );
      }) as any;

      let caught: any = null;
      try {
        await apiClient.post("/items", { title: "" });
      } catch (err) {
        caught = err;
      } finally {
        unsubscribe();
      }

      expect(caught).toBeInstanceOf(ApiClientError);
      expect(caught.status).toBe(400);
      expect(logoutCalled).toBe(false);
      expect(await getAccessToken()).toBe("fresh_token");
      expect(await getRefreshToken()).toBe("fresh_refresh");
    });

    it("should not attempt auto-refresh for requests to /auth/ endpoints", async () => {
      let refreshCalled = false;

      global.fetch = mock(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.endsWith("/auth/refresh")) {
          refreshCalled = true;
        }
        return new Response(
          JSON.stringify({ success: false, message: "Invalid credentials", code: 401 }),
          { status: 401 }
        );
      }) as any;

      try {
        await apiClient.post("/auth/login", { email: "a@b.com", password: "123" });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.status).toBe(401);
        expect(refreshCalled).toBe(false);
      }
    });
  });
});

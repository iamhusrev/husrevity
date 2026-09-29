import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

const mockGetPermissionsAsync = mock();
const mockRequestPermissionsAsync = mock();
const mockGetExpoPushTokenAsync = mock();
const mockPost = mock();

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("expo-notifications", () => ({
  setNotificationHandler: mock(),
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
}));

mock.module("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: "test-project-id",
        },
      },
    },
  },
}));

mock.module("../api/client", () => ({
  apiClient: {
    post: mockPost,
  },
}));

import { registerPushNotification, unregisterPushNotification } from "./register-push";

describe("registerPushNotification", () => {
  beforeEach(() => {
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockGetExpoPushTokenAsync.mockReset();
    mockPost.mockReset();
  });

  it("returns failure when notification permission is denied", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });

    const result = await registerPushNotification();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permission not granted");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("requests permission if existing status is not granted and succeeds when user grants", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, status: "undetermined" });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc123token]" });
    mockPost.mockResolvedValue({ success: true, data: { id: "dev-1" } });

    const result = await registerPushNotification();

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "test-project-id" });
    expect(mockPost).toHaveBeenCalledWith("/devices", {
      platform: "ios",
      pushToken: "ExponentPushToken[abc123token]",
    });
    expect(result.success).toBe(true);
    expect(result.token).toBe("ExponentPushToken[abc123token]");
  });

  it("uses existing granted permission without requesting again", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[xyz789token]" });
    mockPost.mockResolvedValue({ success: true, data: { id: "dev-2" } });

    const result = await registerPushNotification();

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith("/devices", {
      platform: "ios",
      pushToken: "ExponentPushToken[xyz789token]",
    });
    expect(result.success).toBe(true);
    expect(result.token).toBe("ExponentPushToken[xyz789token]");
  });

  it("supports explicit platform override", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[android123]" });
    mockPost.mockResolvedValue({ success: true, data: { id: "dev-3" } });

    const result = await registerPushNotification({ platform: "android" });

    expect(mockPost).toHaveBeenCalledWith("/devices", {
      platform: "android",
      pushToken: "ExponentPushToken[android123]",
    });
    expect(result.success).toBe(true);
  });

  it("catches errors gracefully when push token retrieval or registration fails", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    mockGetExpoPushTokenAsync.mockRejectedValue(new Error("Simulator not supported"));

    const result = await registerPushNotification();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Simulator not supported");
  });
});

describe("unregisterPushNotification", () => {
  beforeEach(() => {
    mockGetExpoPushTokenAsync.mockReset();
    mockPost.mockReset();
  });

  it("posts the current push token to /devices/unregister", async () => {
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc]" });
    mockPost.mockResolvedValue({ success: true });

    await unregisterPushNotification();

    expect(mockPost).toHaveBeenCalledWith("/devices/unregister", {
      pushToken: "ExponentPushToken[abc]",
    });
  });

  it("never throws, even when the token cannot be resolved or the request fails", async () => {
    mockGetExpoPushTokenAsync.mockRejectedValue(new Error("No projectId"));
    await expect(unregisterPushNotification()).resolves.toBeUndefined();

    mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc]" });
    mockPost.mockRejectedValue(new Error("offline"));
    await expect(unregisterPushNotification()).resolves.toBeUndefined();
  });
});

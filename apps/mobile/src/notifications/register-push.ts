import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiClient } from "../api/client";

export interface RegisterPushResult {
  success: boolean;
  token?: string;
  error?: string;
}

export interface RegisterPushOptions {
  platform?: "ios" | "android" | "web";
}

/**
 * Requests push notification permissions, obtains an Expo push token,
 * and registers the token with the backend API via POST /api/devices.
 */
export async function registerPushNotification(
  options?: RegisterPushOptions,
): Promise<RegisterPushResult> {
  try {
    const settings: any = await Notifications.getPermissionsAsync();
    let isGranted =
      Boolean(settings?.granted) ||
      settings?.status === "granted" ||
      settings?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!isGranted) {
      const requested: any = await Notifications.requestPermissionsAsync();
      isGranted =
        Boolean(requested?.granted) ||
        requested?.status === "granted" ||
        requested?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!isGranted) {
      return { success: false, error: "Permission not granted" };
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const pushToken = tokenResponse?.data;
    if (!pushToken) {
      return { success: false, error: "No push token received" };
    }

    const targetPlatform =
      options?.platform ?? (Platform.OS === "android" ? "android" : "ios");

    await apiClient.post("/devices", {
      platform: targetPlatform,
      pushToken,
    });

    return { success: true, token: pushToken };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to register push notification",
    };
  }
}

/**
 * Best-effort: tells the backend to stop sending this device's push
 * notifications to the signed-out user. Never throws — logout must not fail
 * because a push token could not be resolved (no permission, no projectId,
 * Simulator, offline).
 */
export async function unregisterPushNotification(): Promise<void> {
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const pushToken = tokenResponse?.data;
    if (!pushToken) return;
    await apiClient.post("/devices/unregister", { pushToken });
  } catch {
    // best-effort only
  }
}

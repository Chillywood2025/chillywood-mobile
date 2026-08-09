import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

import {
  redirectChillyChatNativeCallSystemPath,
  resolveChillyChatNativeCallActionPayload,
} from "./chillyChatNativeCallRoutes.mjs";
import {
  clearNativeCallTransitionClaims,
  registerTrustedAndroidNativeActionStorePayload,
  sanitizeExternalIosNativeCallPath,
} from "./nativeCallTransitionProvenance.mjs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const nativeCallNotificationModule = NativeModules.ChillyChatCallNotifications as {
  consumePendingNativeCallAction?: () => Promise<unknown>;
  readPendingNativeCallActionStatus?: () => Promise<unknown>;
} | undefined;

export async function consumePendingAndroidNativeCallRoute(input: {
  authenticatedUserId: string;
}) {
  if (Platform.OS !== "android") return null;
  const authenticatedUserId = String(input?.authenticatedUserId ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(authenticatedUserId)) return null;
  const pendingAction =
    await nativeCallNotificationModule?.consumePendingNativeCallAction?.();
  const payload = resolveChillyChatNativeCallActionPayload(pendingAction);
  if (!payload) return null;
  return registerTrustedAndroidNativeActionStorePayload({
    ...payload,
    authenticated: true,
    authenticatedUserId,
  });
}

export async function readPendingAndroidNativeCallActionStatus() {
  if (Platform.OS !== "android") return null;
  const value =
    await nativeCallNotificationModule?.readPendingNativeCallActionStatus?.();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = String((value as { status?: unknown }).status ?? "");
  const schemaVersion = Number(
    (value as { schemaVersion?: unknown }).schemaVersion,
  );
  if (
    !["empty", "expired", "present"].includes(status)
    || schemaVersion !== 2
  ) {
    return null;
  }
  return { schemaVersion, status };
}

export const subscribeToPendingAndroidNativeCallActionAvailability = (
  listener: () => void,
) => {
  if (Platform.OS !== "android" || typeof listener !== "function") {
    return () => {};
  }
  const subscription = DeviceEventEmitter.addListener(
    "pendingNativeCallActionAvailable",
    listener,
  );
  return () => subscription.remove();
};

export const redirectEarlyAndroidNativeCallSystemPath = (path: string) => (
  redirectChillyChatNativeCallSystemPath(sanitizeExternalIosNativeCallPath(path))
);

export const clearPendingAndroidNativeCallRouteClaims = () => {
  if (Platform.OS === "android") clearNativeCallTransitionClaims("android");
};

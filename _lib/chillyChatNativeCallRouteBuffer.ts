import { NativeModules, Platform } from "react-native";

import {
  clearTrustedAndroidNativeCallActions,
  redirectChillyChatNativeCallSystemPath,
  registerConsumedAndroidNativeCallAction,
} from "./chillyChatNativeCallRoutes.mjs";
const nativeCallNotificationModule = NativeModules.ChillyChatCallNotifications as {
  consumePendingNativeCallAction?: () => Promise<unknown>;
  readPendingNativeCallActionStatus?: () => Promise<unknown>;
} | undefined;

export async function consumePendingAndroidNativeCallRoute() {
  if (Platform.OS !== "android") return null;
  const pendingAction =
    await nativeCallNotificationModule?.consumePendingNativeCallAction?.();
  return registerConsumedAndroidNativeCallAction(pendingAction);
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
    || schemaVersion !== 1
  ) {
    return null;
  }
  return { schemaVersion, status };
}

export const redirectEarlyAndroidNativeCallSystemPath = (path: string) => (
  redirectChillyChatNativeCallSystemPath(path)
);

export const clearPendingAndroidNativeCallRouteClaims = () => {
  if (Platform.OS === "android") clearTrustedAndroidNativeCallActions();
};

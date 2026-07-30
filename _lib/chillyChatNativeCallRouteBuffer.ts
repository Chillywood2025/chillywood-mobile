import { Linking, NativeModules, Platform } from "react-native";

import {
  createChillyChatNativeCallRouteBuffer,
  redirectChillyChatNativeCallSystemPath,
  resolveChillyChatNativeCallActionPayload,
  resolveChillyChatNativeCallRoute,
} from "./chillyChatNativeCallRoutes.mjs";

type NativeCallRouteListener = (
  route: NonNullable<ReturnType<typeof resolveChillyChatNativeCallRoute>>,
) => void;

const earlyNativeCallRouteBuffer = createChillyChatNativeCallRouteBuffer();
const nativeCallNotificationModule = NativeModules.ChillyChatCallNotifications as {
  consumePendingNativeCallAction?: () => Promise<unknown>;
  readPendingNativeCallActionStatus?: () => Promise<unknown>;
} | undefined;

if (Platform.OS === "android") {
  Linking.addEventListener("url", ({ url }) => {
    earlyNativeCallRouteBuffer.capture(url);
  });
}

export async function consumePendingAndroidNativeCallRoute() {
  if (Platform.OS !== "android") return null;
  const pendingAction =
    await nativeCallNotificationModule?.consumePendingNativeCallAction?.();
  return resolveChillyChatNativeCallActionPayload(pendingAction);
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

export const subscribeToEarlyAndroidNativeCallRoutes = (
  listener: NativeCallRouteListener,
) => earlyNativeCallRouteBuffer.subscribe(listener);

export const redirectEarlyAndroidNativeCallSystemPath = (path: string) => (
  earlyNativeCallRouteBuffer.capture(path)
    ? redirectChillyChatNativeCallSystemPath(path)
    : path
);

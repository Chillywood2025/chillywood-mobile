import { Linking, Platform } from "react-native";

import {
  createChillyChatNativeCallRouteBuffer,
  redirectChillyChatNativeCallSystemPath,
  resolveChillyChatNativeCallRoute,
} from "./chillyChatNativeCallRoutes.mjs";

type NativeCallRouteListener = (
  route: NonNullable<ReturnType<typeof resolveChillyChatNativeCallRoute>>,
) => void;

const earlyNativeCallRouteBuffer = createChillyChatNativeCallRouteBuffer();

if (Platform.OS === "android") {
  Linking.addEventListener("url", ({ url }) => {
    earlyNativeCallRouteBuffer.capture(url);
  });
}

export const subscribeToEarlyAndroidNativeCallRoutes = (
  listener: NativeCallRouteListener,
) => earlyNativeCallRouteBuffer.subscribe(listener);

export const redirectEarlyAndroidNativeCallSystemPath = (path: string) => (
  redirectChillyChatNativeCallSystemPath(path)
);

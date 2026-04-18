import { getApp } from "@react-native-firebase/app";
import { Platform } from "react-native";

const canUseFirebaseNative = () => Platform.OS !== "web";

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-app] ${scope}: ${message}`);
};

export function ensureFirebaseDefaultApp() {
  if (!canUseFirebaseNative()) return false;

  try {
    getApp();
    return true;
  } catch (error) {
    maybeWarn("ensure-default-app", error);
    return false;
  }
}

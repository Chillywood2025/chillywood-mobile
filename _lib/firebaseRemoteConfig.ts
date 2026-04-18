import { Platform } from "react-native";

import { ensureFirebaseDefaultApp } from "./firebaseApp";
import { REMOTE_CONFIG_DEFAULTS } from "./featureFlags";

type RemoteConfigPrimitive = boolean | string | number;

let remoteConfigBootstrapped = false;

const canUseFirebaseRemoteConfig = () => Platform.OS !== "web";

let cachedRemoteConfigModule: typeof import("@react-native-firebase/remote-config").default | null = null;

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-remote-config] ${scope}: ${message}`);
};

const getRemoteConfigModule = () => {
  if (!canUseFirebaseRemoteConfig()) return null;
  if (!ensureFirebaseDefaultApp()) return null;

  cachedRemoteConfigModule ??=
    require("@react-native-firebase/remote-config").default as typeof import("@react-native-firebase/remote-config").default;

  return cachedRemoteConfigModule;
};

const getRemoteConfigDefault = (key: string, fallback?: RemoteConfigPrimitive) => {
  if (key in REMOTE_CONFIG_DEFAULTS) {
    return REMOTE_CONFIG_DEFAULTS[key as keyof typeof REMOTE_CONFIG_DEFAULTS];
  }

  return fallback;
};

export async function bootstrapFirebaseRemoteConfig() {
  const remoteConfigModule = getRemoteConfigModule();
  if (!remoteConfigModule) return false;

  try {
    const instance = remoteConfigModule();

    if (!remoteConfigBootstrapped) {
      await instance.setDefaults(REMOTE_CONFIG_DEFAULTS);
      await instance.setConfigSettings({
        minimumFetchIntervalMillis: __DEV__ ? 0 : 60 * 60 * 1000,
        fetchTimeMillis: 10 * 1000,
      });
      remoteConfigBootstrapped = true;
    }

    return await instance.fetchAndActivate();
  } catch (error) {
    maybeWarn("bootstrap", error);
    return false;
  }
}

export function getRemoteConfigBoolean(key: string, fallback?: boolean) {
  const defaultValue = getRemoteConfigDefault(key, fallback);

  const remoteConfigModule = getRemoteConfigModule();
  if (!remoteConfigModule) return Boolean(defaultValue);

  try {
    return remoteConfigModule().getValue(key).asBoolean();
  } catch (error) {
    maybeWarn(`get-boolean:${key}`, error);
    return Boolean(defaultValue);
  }
}

export function getRemoteConfigString(key: string, fallback?: string) {
  const defaultValue = getRemoteConfigDefault(key, fallback);

  const remoteConfigModule = getRemoteConfigModule();
  if (!remoteConfigModule) return String(defaultValue ?? "");

  try {
    return remoteConfigModule().getValue(key).asString();
  } catch (error) {
    maybeWarn(`get-string:${key}`, error);
    return String(defaultValue ?? "");
  }
}

export function getRemoteConfigNumber(key: string, fallback?: number) {
  const defaultValue = getRemoteConfigDefault(key, fallback);

  const remoteConfigModule = getRemoteConfigModule();
  if (!remoteConfigModule) return Number(defaultValue ?? 0);

  try {
    return remoteConfigModule().getValue(key).asNumber();
  } catch (error) {
    maybeWarn(`get-number:${key}`, error);
    return Number(defaultValue ?? 0);
  }
}

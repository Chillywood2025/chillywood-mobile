import remoteConfig from "@react-native-firebase/remote-config";
import { Platform } from "react-native";

import { REMOTE_CONFIG_DEFAULTS } from "./featureFlags";

type RemoteConfigPrimitive = boolean | string | number;

let remoteConfigBootstrapped = false;

const canUseFirebaseRemoteConfig = () => Platform.OS !== "web";

const maybeWarn = (scope: string, error: unknown) => {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.warn(`[firebase-remote-config] ${scope}: ${message}`);
};

const getRemoteConfigDefault = (key: string, fallback?: RemoteConfigPrimitive) => {
  if (key in REMOTE_CONFIG_DEFAULTS) {
    return REMOTE_CONFIG_DEFAULTS[key as keyof typeof REMOTE_CONFIG_DEFAULTS];
  }

  return fallback;
};

export async function bootstrapFirebaseRemoteConfig() {
  if (!canUseFirebaseRemoteConfig()) return false;

  try {
    const instance = remoteConfig();

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

  if (!canUseFirebaseRemoteConfig()) return Boolean(defaultValue);

  try {
    return remoteConfig().getValue(key).asBoolean();
  } catch (error) {
    maybeWarn(`get-boolean:${key}`, error);
    return Boolean(defaultValue);
  }
}

export function getRemoteConfigString(key: string, fallback?: string) {
  const defaultValue = getRemoteConfigDefault(key, fallback);

  if (!canUseFirebaseRemoteConfig()) return String(defaultValue ?? "");

  try {
    return remoteConfig().getValue(key).asString();
  } catch (error) {
    maybeWarn(`get-string:${key}`, error);
    return String(defaultValue ?? "");
  }
}

export function getRemoteConfigNumber(key: string, fallback?: number) {
  const defaultValue = getRemoteConfigDefault(key, fallback);

  if (!canUseFirebaseRemoteConfig()) return Number(defaultValue ?? 0);

  try {
    return remoteConfig().getValue(key).asNumber();
  } catch (error) {
    maybeWarn(`get-number:${key}`, error);
    return Number(defaultValue ?? 0);
  }
}
